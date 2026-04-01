import ObjC from "frida-objc-bridge";
import { Agent } from "./libs/pull.js"
import path from "node:path";

const dummySeedData = ObjC.classes.NSString.stringWithString_("3544003544003544003544000000000000000000000000DD");

const makeSeedDataBlock = ObjC.classes.EBIWrapperEnvID["- makeSeedDataBlock"];
if (makeSeedDataBlock) {
    Interceptor.attach(makeSeedDataBlock.implementation, {
        onLeave(retval) {
            retval.replace(dummySeedData);
        },
    })
}

const agent = new Agent();

const moduleSecurity = Process.getModuleByName("Security");
const SecItemCopyMatching = new NativeFunction(
    moduleSecurity.getExportByName("SecItemCopyMatching"),
    'int', ['pointer', 'pointer']
);

const kSecClass = moduleSecurity.getExportByName("kSecClass").readPointer();
const kSecClassGenericPassword = moduleSecurity.getExportByName("kSecClassGenericPassword").readPointer();
const kSecAttrAccount = moduleSecurity.getExportByName("kSecAttrAccount").readPointer();
const kSecAttrService = moduleSecurity.getExportByName("kSecAttrService").readPointer();
const kSecReturnData = moduleSecurity.getExportByName("kSecReturnData").readPointer();
const kSecMatchLimit = moduleSecurity.getExportByName("kSecMatchLimit").readPointer();
const kSecMatchLimitOne = moduleSecurity.getExportByName("kSecMatchLimitOne").readPointer();
const kCFBooleanTrue = moduleSecurity.getExportByName("kCFBooleanTrue").readPointer();
function searchKeychainValueForKey(key: string, service: string) {
    const query = ObjC.classes.NSMutableDictionary.alloc().init();
    query.setObject_forKey_(kSecClassGenericPassword, kSecClass);
    query.setObject_forKey_(ObjC.classes.NSString.stringWithString_(key), kSecAttrAccount);
    query.setObject_forKey_(ObjC.classes.NSString.stringWithString_(service), kSecAttrService);
    query.setObject_forKey_(kCFBooleanTrue, kSecReturnData);
    query.setObject_forKey_(kSecMatchLimitOne, kSecMatchLimit);

    const result = Memory.alloc(Process.pointerSize);
    const status = SecItemCopyMatching(query, result);
    if (status === 0) {
        return new ObjC.Object(result.readPointer());
    } else {
        return null;
    }
}

function searchEbixFiles() {
    const fileManager = ObjC.classes.NSFileManager.defaultManager();
    const urls = fileManager.URLsForDirectory_inDomains_(5, 1); // 5 = LibraryDirectory, 1 = NSUserDomainMask
    const booksDir = urls.firstObject().path().stringByAppendingPathComponent_(
        ObjC.classes.NSString.stringWithString_("Book")
    );
    const enumerator = fileManager.enumeratorAtPath_(booksDir);

    const ebixFiles: string[] = [];
    for (let file = enumerator.nextObject(); file !== null; file = enumerator.nextObject()) {
        const filePath = booksDir.stringByAppendingPathComponent_(file);
        if (filePath.pathExtension().lowercaseString().toString() === "ebix") {
            ebixFiles.push(filePath.toString());
        }
    }
    return ebixFiles;
}

async function extractEbiFile(file: ObjC.Object) {
    console.log(`Extracting EBI file... Image count: ${file.getImageCount()}`);
    for (let i = 0; i < file.getImageCount(); i++) {
        
        const imageDict = file.imageDataDictAtIndex_(i);
        const imageError = imageDict.objectForKey_(ObjC.classes.NSString.stringWithString_("error"));
        if (imageError == 0) {
            const imageData = imageDict.objectForKey_(ObjC.classes.NSString.stringWithString_("data"));
            const data = ptr(imageData.bytes()).readByteArray(2);
            // console.log(`Image data header: ${data ? new Uint8Array(data) : "null"}`);
            
            var dataToWrite = imageData;
            var extension = "bin";
            if (data) {
                const header = new Uint8Array(data);
                if (header[0] === 0xFF && header[1] === 0xD8) {
                    extension = "jpg";
                } else if (header[0] === 0x42 && header[1] === 0x4D) {
                    extension = "png";
                    const img = ObjC.classes.NSImage.alloc().initWithData_(imageData);
                    const pngData = img.UIImagePNGRepresentation();
                    dataToWrite = pngData;
                }

                await agent.pull_buffer(
                    Buffer.from(ptr(dataToWrite.bytes()).readByteArray(dataToWrite.length())!), 
                    `${(i + 1).toString().padStart(4, '0')}.${extension}`,
                    "w"
                );
            }
        } else {
            console.log(`\nCannot process image ${i + 1}/${file.getImageCount()}, error code: ${imageError}`);
        }
    }
    send({type: "save"})
}

function readLvfFileList(instance: NativePointer) {
    var listPtr = instance.add(0x08).readPointer();
    const listCount = instance.readU32();
    const fileList: string[] = [];

    for (let i = 0; i < listCount; i++) {
        const recordLen = listPtr.readU16();
        if (recordLen === 0) {
            break;
        }
        const recordNamePtr = listPtr.add(0x08).readPointer()
        if (recordNamePtr.isNull()) {
            break;
        }
        const recordName = recordNamePtr.readUtf8String();
        if (recordName) {
            fileList.push(recordName);
        }
        listPtr = listPtr.add(0x30);
    }
    return fileList;
}

// int BV_getFileSize(void* instance, void* structPointer, const wchar_t* fileName, int* sizeOut);
const BV_getFileSize = new NativeFunction(
    Process.getModuleByName("EBIWrapperKit").getExportByName("BV_getFileSize"),
    'int', ['pointer', 'pointer', 'pointer', 'pointer']
);

// int BV_readFile(void* instance, void* structPointer, const wchar_t* fileName, int offset, int size, int* outSize, void* buffer);
const BV_readFile = new NativeFunction(
    Process.getModuleByName("EBIWrapperKit").getExportByName("BV_readFile"),
    'int', ['pointer', 'pointer', 'pointer', 'int', 'pointer', 'pointer', 'pointer']
);

async function extractLvfFile(filePath: string, envId: ObjC.Object) {
    const CEngineMng_Open = Process.findModuleByName("EBIWrapperKit")?.
                                    findExportByName("_ZN10CEngineMng4OpenERKNSt3__112basic_stringIwNS0_11char_traitsIwEENS0_9allocatorIwEEEES8_");
    if (!CEngineMng_Open) {
        console.error("Failed to find CEngineMng::Open");
        return;
    }

    const InterceptOpen = new Promise((resolve) => {
        const interceptor = Interceptor.attach(CEngineMng_Open, {
            onLeave(retval) {
                console.info("CEngineMng::Open called, instance at: " + retval);
                resolve(retval.toString());
                interceptor.detach();
            },
        });
    });

    const fileManager = ObjC.classes.NSFileManager.defaultManager();
    const temporyDir = fileManager.temporaryDirectory().path();
    const error = ObjC.classes.NSError.alloc().init();
    const ICFileReader = ObjC.classes.ICFileReader.alloc().initWithPath_temporary_error_envid_(
        ObjC.classes.NSString.stringWithString_(filePath), temporyDir, error, envId
    )
    console.log(`ICFileReader initialized for ${filePath}`);
    const XmdfRenderer = ObjC.classes.XmdfRenderer.alloc().initWithReader_error_(
        ICFileReader, error
    )
    console.log(`XmdfRenderer initialized for ${filePath}`);

    const instanceAddr = ptr((await InterceptOpen) as string);
    console.log(`Extracting files from LVF... Instance address: ${instanceAddr}`);

    const fileList = readLvfFileList(instanceAddr.add(0x1a158));
    console.log(`Found ${fileList.length} files in LVF. Extracting...`);

    for (const fileName of fileList) {
        const sizeOut = Memory.alloc(4);
        const fileNameW = Memory.allocUtf16String(fileName);

        const sizeResult = BV_getFileSize(
            instanceAddr.add(0x420), instanceAddr.add(0xe854), fileNameW, sizeOut
        );
        if (sizeResult !== 0) {
            console.error(`Failed to get file size for ${fileName}`);
            continue;
        }
        const fileSize = sizeOut.readU32();
        // console.log(`File size for ${fileName}: ${fileSize} bytes`);
        
        const buffer = Memory.alloc(fileSize);
        const outSize = Memory.alloc(4);
        const result = BV_readFile(
            instanceAddr.add(0x420), instanceAddr.add(0xe854), fileNameW, 0, sizeOut, outSize, buffer
        );
        const actualSize = outSize.readU32();

        if (result === 0 && actualSize === fileSize) {
            const dirname = path.dirname(fileName);
            if (dirname.length > 0) {
                send({type: "directory", path: dirname});
            }

            await agent.pull_buffer(Buffer.from(buffer.readByteArray(actualSize)!), fileName, "w")
            // console.log(`Successfully extracted ${fileName}`);
        } else {
            console.error(`Failed to get file data for ${fileName}. Result: ${result}, Actual Size: ${actualSize}`);
        }
    }
    send({type: "save"})
}

async function openEbixFileAndExtract(filePath: string) {
    const uuid = ObjC.classes.NSString.alloc().initWithData_encoding_(
        searchKeychainValueForKey("uuid", "jp.co.yahoo.ebookjapan"), 4
    ); // 4 = NSUTF8StringEncoding
    const uuidGenDate = ObjC.classes.NSString.alloc().initWithData_encoding_(
        searchKeychainValueForKey("generated_date", "jp.co.yahoo.ebookjapan"), 4
    );

    const envID = ObjC.classes.EBIWrapperEnvID.alloc().init().createNewBuildIdentifier_uuidGenDate_(
        uuid, uuidGenDate
    ).firstObject();
    
    const file: ObjC.Object = ObjC.classes.EBIWrapperEbixFile.alloc().init();
     
    if (file.openInstanceWithPath_envID_(
        ObjC.classes.NSString.stringWithString_(filePath), envID
    )) {
        file.enableMultiThread();
        file.setImageDataAsJpeg_(true);
        const bookInfo = file.getBookInfo();
        const fileInfo = file.getFileInfo();

        const bodyFormat = fileInfo.bodyFormat().toString();
        const bodyFormatVersion = fileInfo.bodyFormatVersion().toString();

        switch (bodyFormat) {
            case "ebi":
                send({type: "info", bundleId: bookInfo.bookName().toString(), fileFormat: "cbz"})
                await extractEbiFile(file);
                break;
            case "lvf":
                send({type: "info", bundleId: bookInfo.bookName().toString(), fileFormat: "lvf"})
                await extractLvfFile(filePath, envID);
                break;
            default:
                console.error(`Unsupported body format: ${bodyFormat}`);
        }
        file.closeInstance();
        console.log(`\nExtraction completed for ${filePath}`);
    } else {
        console.error(`\nFailed to open EBIX file: ${filePath}`);
    }
}

async function dumpall() {
    const ebixFiles = searchEbixFiles();
    if (ebixFiles.length == 0) {
        console.error("No EBIX files found");
        return;
    }
    console.log(`Found ${ebixFiles.length} EBIX files. Extracting the first one...`);
    for (const ebixFile of ebixFiles) {
        console.log(`Processing file: ${ebixFile}`);
        await openEbixFileAndExtract(ebixFile);
    }
}

rpc.exports = {
    dumpall: () => dumpall(),
    dump: (filePath: string) => openEbixFileAndExtract(filePath),
    search: () => searchEbixFiles()
}