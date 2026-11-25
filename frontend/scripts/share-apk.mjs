// Serves the AklatOne APK on the school Wi-Fi and prints a QR code in the terminal (used by lan-apk.sh share).
// Members scan it with the phone camera, download, and install ("Install unknown apps" must be allowed once).
// Stops with Ctrl+C. Only the APK and a small instruction page are served; nothing else on this laptop.
import http from "node:http";
import { createReadStream, statSync } from "node:fs";
import QRCode from "qrcode";

const [apk, ip] = process.argv.slice(2);
const PORT = Number(process.env.SHARE_PORT ?? 8090);
const size = statSync(apk).size;
const page = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>AklatOne app</title>
<body style="font-family:sans-serif;max-width:28rem;margin:2rem auto;padding:0 1rem;color:#1E326D">
<h1>AklatOne</h1><p>Tagumpay National High School Library app for students and teachers.</p>
<p><a href="/AklatOne.apk" style="display:inline-block;padding:.9rem 1.4rem;background:#1E326D;color:#fff;border-radius:1rem;text-decoration:none;font-weight:bold">Download the app (${(size / 1048576).toFixed(1)} MB)</a></p>
<ol><li>Open the downloaded file.</li><li>If asked, allow your browser to install unknown apps.</li><li>Open AklatOne and sign in with the account the librarian gave you.</li></ol>
<p>iPhone: not available this way yet.</p></body>`;

http.createServer((req, res) => {
  if (req.url === "/AklatOne.apk") {
    res.writeHead(200, { "Content-Type": "application/vnd.android.package-archive", "Content-Length": size, "Content-Disposition": 'attachment; filename="AklatOne.apk"' });
    createReadStream(apk).pipe(res);
  } else if (req.url === "/" || req.url === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(page);
  } else {
    res.writeHead(404).end();
  }
}).listen(PORT, async () => {
  const url = `http://${ip}:${PORT}/`;
  console.log(await QRCode.toString(url, { type: "terminal", small: true }));
  console.log(`  Scan with the phone camera, or open ${url}`);
  console.log(`  (phones must be on the same Wi-Fi; open port ${PORT} once: sudo firewall-cmd --add-port=${PORT}/tcp)`);
  console.log("  Ctrl+C to stop sharing.");
});
