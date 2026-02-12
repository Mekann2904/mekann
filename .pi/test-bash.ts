import { readdirSync } from "fs";
import { join } from "path";

const extDir = join(__dirname, "extensions");
const files = readdirSync(extDir);

console.log("Extensions in .pi/extensions/:");
files.forEach(f => console.log(f));
