import os from "os";
import { OSInterface } from "./types.js";
import { LinuxOS } from "./linux.js";
import { MacOS } from "./mac.js";
import { WindowsOS } from "./windows.js";

function createOS(): OSInterface {
  switch (os.platform()) {
    case "win32":  return new WindowsOS();
    case "darwin": return new MacOS();
    default:       return new LinuxOS();   // linux + other unix
  }
}

/** The platform-appropriate OS implementation, resolved once at startup. */
export const OS: OSInterface = createOS();

console.log(`[OS] platform=${OS.platform} impl=${OS.constructor.name}`);

export * from "./types.js";
