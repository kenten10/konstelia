import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const vsixUrl = new URL("../konstelia.vsix", import.meta.url);
const checksumUrl = new URL("../konstelia.vsix.sha256", import.meta.url);
const contents = await readFile(vsixUrl);
const digest = createHash("sha256").update(contents).digest("hex");

await writeFile(checksumUrl, `${digest}  konstelia.vsix\n`, "utf8");
console.log(`${digest}  konstelia.vsix`);
