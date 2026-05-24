import Java from "frida-java-bridge";
import { Agent } from "./libs/pull.js"
import { PlatformImpl } from "./types.js"

let initialized = false;

let agent: Agent;
let factory: Java.ClassFactory;

function javaPerform<T>(fn: () => T): T {
  let result!: T;

  Java.perform(() => {
    result = fn();
  });

  return result;
}

export function createAndroidImpl(): PlatformImpl {
  return {
    init: () => Java.perform(init),
    dumpAll: () => javaPerform(dumpall),
    dump: (filePath: string) => {
        return javaPerform(() => {
            return openEbixFileAndExtract(filePath)
        })
    },
    search: () => javaPerform(searchEbixFiles),
  };
}

function init() {
    if (!initialized) initialized = true;
    else return;

    agent = new Agent()

    const targetClassName = "jp.ebookjapan.libebook.book.EBook";

    Java.enumerateClassLoaders({
        onMatch: async function(loader) {
            try {
                if (loader.findClass(targetClassName)) {
                    factory = Java.ClassFactory.get(loader);
                }
            }
            catch (e) {}
        },
        onComplete: function() {}
    })
}

function searchEbixFiles() {
    if (!initialized) init()

    const File = Java.use('java.io.File');
    const ActivityThread = Java.use('android.app.ActivityThread');
    const Context = Java.use('android.content.Context');

    /**
     * 递归扫描目录
     * @param {Object} dir java.io.File 对象
     * @param {string} extension 目标后缀名 (例如 ".xml")
     */
    function scanDirectory(dir, extension, results) {
        if (!dir.exists() || !dir.isDirectory()) return;

        const files = dir.listFiles();
        if (files === null) return;

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (file.isDirectory()) {
                // 如果是文件夹，继续递归
                scanDirectory(file, extension, results);
            } else {
                // 如果是文件，检查后缀
                const fileName = file.getName();
                if (fileName.endsWith(extension)) {
                    const absPath = file.getAbsolutePath().toString();
                    results.push(absPath);
                    console.log(absPath);
                }
            }
        }
    }

    const currentApplication = ActivityThread.currentApplication();
    const context = Java.cast(currentApplication, Context);

    const dataDir = context.getApplicationInfo().dataDir.value;
    const rootFile = File.$new(dataDir, "files");

    const targetExtension = ".ebix";
    
    const ebixFiles: string[] = new Array;
    scanDirectory(rootFile, targetExtension, ebixFiles);

    return ebixFiles
}

/**
 * 将 java.nio.DirectByteBuffer 转换为 Frida 的 ArrayBuffer
 * @param {Object} buffer - 拦截到的 Java ByteBuffer 实例
 * @returns {ArrayBuffer|null} - 提取到的 JS ArrayBuffer 数据
 */
function extractDirectBuffer(buffer) {
    if (!buffer) return null;

    const Buffer = Java.use("java.nio.Buffer");
    const ByteBuffer = Java.use("java.nio.ByteBuffer");
    const dup = Java.cast(buffer, ByteBuffer).duplicate();

    const b = Java.cast(dup, Buffer);
    // const pos = b.position();
    const len = b.remaining();

    if (len <= 0) {
        return new ArrayBuffer(0);
    }

    if (dup.isDirect()) {
        const env = Java.vm.getEnv();
        const base = env.getDirectBufferAddress(dup.$h);

        if (base.isNull()) {
            throw new Error("DirectByteBuffer address is NULL");
        }

        return base.readByteArray(len);
    }

    // heap ByteBuffer fallback：复制
    const arr = Java.array("byte", new Array(len));
    dup.get(arr);

    const ab = new ArrayBuffer(len);
    const u8 = new Uint8Array(ab);
    for (let i = 0; i < len; i++) {
        u8[i] = arr[i] & 0xff;
    }
    return ab;
}

function findInstance(className) {
    return new Promise(function(resolve, reject) {
        Java.choose(className, {
            onMatch: function (instance) {
                resolve(instance);
                return 'stop';
            },
            onComplete: function () {
                resolve(null);
            }
        });
    });
}

async function extractEbiFile(ebook: any) {
    const total_page: number = ebook.totalPage.value
    for (let page = 0; page < total_page; page++) {
        var extension = "bin";
        const rawbuf = ebook.getImage(page, 0)
        const buf: ArrayBuffer = extractDirectBuffer(rawbuf)
        const view = Buffer.from(buf)

        if (view[0] === 0xFF && view[1] === 0xD8) {
            extension = "jpg";
        } else if (view[0] === 0x42 && view[1] === 0x4D) {
            extension = "bmp";
        }

        await agent.pull_buffer(
            view, 
            `${(page + 1).toString().padStart(4, '0')}.${extension}`,
            "w"
        );
    }
    send({type: "save"})
}

async function openEbixFileAndExtract(filePath: string) {
    if (!initialized) init();

    const EBook = factory.use("jp.ebookjapan.libebook.book.EBook");
    let ebook = EBook.getInstance(false)

    const ActivityThread = Java.use('android.app.ActivityThread');
    const Context = Java.use('android.content.Context');
    const currentApplication = ActivityThread.currentApplication();
    const context = Java.cast(currentApplication, Context);

    let envID4: any = await findInstance("jp.ebookjapan.libebook.book.EnvID4");
    const envID4_str = envID4.j();

    ebook.$init(context, filePath, envID4_str, 0, false, false)
    ebook.a(context, envID4_str)
    ebook.enableMT();

    const bodyFormat = ebook.tcBodyFormat.value.toString()
    switch (bodyFormat) {
        case "ebi":
            send({type: "info", bundleId: ebook.tcBookName.value.toString(), fileFormat: "cbz"})
            await extractEbiFile(ebook);
            break;
        default:
            console.error(`Unsupported body format: ${bodyFormat}`);
    }
    ebook.close();
    console.log(`\nExtraction completed for ${filePath}`);
}

async function dumpall() {
    if (!initialized) init();

    const ebixFiles = searchEbixFiles()
    if (!ebixFiles || ebixFiles.length == 0) {
        console.error("No EBIX files found");
        return;
    }
    for (const filePath of ebixFiles) {
        console.log(`Processing file: ${filePath}`);
        await openEbixFileAndExtract(filePath);
    }
}