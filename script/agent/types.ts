export type PlatformImpl = {
    init(): void;
    dumpAll(): Promise<void>;
    dump(filePath: string): Promise<void>;
    search(): string[];
};

export type iOSNativeFuncs = {
    SecItemCopyMatching: NativeFunction<number, [NativePointerValue, NativePointerValue]>;
    BV_getFileSize: NativeFunction<number, [NativePointerValue, NativePointerValue, NativePointerValue, NativePointerValue]>;
    BV_readFile: NativeFunction<number, [NativePointerValue, NativePointerValue, NativePointerValue, number, NativePointerValue, NativePointerValue, NativePointerValue]>;
};