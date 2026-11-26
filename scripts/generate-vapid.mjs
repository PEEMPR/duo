// สร้างคู่คีย์ VAPID สำหรับ Web Push (รันครั้งเดียว: npm run push:keys)
// คีย์ส่วนตัวสร้างบนเครื่องของคุณเอง และไม่ถูกส่งไปไหน จนกว่าคุณจะตั้งเป็น secret ใน Cloudflare
const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const raw = new Uint8Array(await crypto.subtle.exportKey("raw", publicKey));
const jwk = await crypto.subtle.exportKey("jwk", privateKey);
const b64url = (u8) => Buffer.from(u8).toString("base64url");
const pub = b64url(raw);
if (process.argv.includes("--json")) {
  // ใช้โดย scripts/deploy.ps1: ไม่พิมพ์อะไรอื่นนอกจาก JSON
  process.stdout.write(JSON.stringify({ publicKey: pub, privateKey: jwk.d }));
  process.exit(0);
}
console.log("\nVAPID_PUBLIC_KEY =", pub);
console.log("VAPID_PRIVATE_KEY =", jwk.d);
console.log("\nตั้งเป็น secret ใน Cloudflare (รันทีละบรรทัด):");
console.log(`  npx cf workers secrets update VAPID_PUBLIC_KEY --worker couple-app --text "${pub}"`);
console.log(`  npx cf workers secrets update VAPID_PRIVATE_KEY --worker couple-app --text "${jwk.d}"`);
console.log("\nทดสอบบนเครื่อง: ใส่ 2 บรรทัดนี้ในไฟล์ .dev.vars (ห้าม commit)");
console.log(`  VAPID_PUBLIC_KEY=${pub}`);
console.log(`  VAPID_PRIVATE_KEY=${jwk.d}\n`);
