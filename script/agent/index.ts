import ObjC from "frida-objc-bridge";
import Java from "frida-java-bridge";

import { PlatformImpl } from "./types.js";
import { createIosImpl } from "./ios.js";
import { createAndroidImpl } from "./android.js";

function detectPlatform(): "ios" | "android" {
    let plat: "ios" | "android" | null = null;
    if (typeof ObjC !== "undefined" && ObjC.available) plat = "ios";
    if (typeof Java !== "undefined" && Java.available) plat = "android";

    if (plat === null) {
        throw new Error("Unsupported platform");
    } else {
        console.log(`Detected Platform: ${plat}`)
        return plat
    }
}

const iosImpl: PlatformImpl = createIosImpl();
const androidImpl: PlatformImpl = createAndroidImpl();

const impl = detectPlatform() === "ios" ? iosImpl : androidImpl;

rpc.exports = {
    init: () => impl.init(),
    dumpall: () => impl.dumpAll(),
    dump: (filePath: string) => impl.dump(filePath),
    search: () => impl.search(),
};