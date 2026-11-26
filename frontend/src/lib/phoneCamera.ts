import { Capacitor } from "@capacitor/core";
import { BarcodeScanner, BarcodeFormat, GoogleBarcodeScannerModuleInstallState as Install } from "@capacitor-mlkit/barcode-scanning";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { CapacitorPluginMlKitTextRecognition } from "@pantrist/capacitor-plugin-ml-kit-text-recognition";

// Phone camera through Google ML Kit (on the phone itself: offline, no HTTPS needed, no web camera permission).
// Android only: the iOS project uses Swift Package Manager, which these two ML Kit plugins do not support yet, so
// iPhones keep the web camera scanner and typing.
export const nativeQr = () => Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("BarcodeScanner");
export const nativeOcr = () => Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("CapacitorPluginMlKitTextRecognition");

/**
 * The first scan on a phone downloads Google's scanner (once). Instead of asking to try again later, wait for it
 * (up to 2 minutes) and report the progress, then open the scanner by itself.
 */
async function ensureScannerModule(onStatus?: (text: string) => void): Promise<void> {
  if ((await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable()).available) return;
  onStatus?.("Getting the QR scanner ready (one time only)…");
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { void handle.then(h => h.remove()); reject(new Error("The QR scanner is still downloading. Check the internet connection, then try again.")); }, 120_000);
    const handle = BarcodeScanner.addListener("googleBarcodeScannerModuleInstallProgress", e => {
      if (e.state === Install.DOWNLOADING && e.progress !== undefined) onStatus?.(`Downloading the QR scanner… ${e.progress}%`);
      if (e.state === Install.INSTALLING) onStatus?.("Installing the QR scanner…");
      if (e.state === Install.COMPLETED) { clearTimeout(timer); void handle.then(h => h.remove()); resolve(); }
      if (e.state === Install.FAILED || e.state === Install.CANCELED) { clearTimeout(timer); void handle.then(h => h.remove()); reject(new Error("The QR scanner could not be downloaded. Check the internet connection, then try again.")); }
    });
    BarcodeScanner.installGoogleBarcodeScannerModule().catch(() => { /* already installing: the listener reports it */ });
  });
  onStatus?.("");
}

/** Opens the phone's QR scanner screen; returns the code, or null when the member closes it. Throws with a readable message. */
export async function scanQr(onStatus?: (text: string) => void): Promise<string | null> {
  await ensureScannerModule(onStatus);
  try {
    const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode], autoZoom: true });
    const code = barcodes[0]?.rawValue?.trim() || null;
    if (code) navigator.vibrate?.(60); // a short buzz: the scan worked
    return code;
  } catch (err) {
    if (/cancel/i.test(String((err as Error)?.message))) return null;
    throw new Error("The camera could not start. Allow the camera for AklatOne in the phone's Settings > Apps, then try again.");
  }
}

export interface TextLine { text: string; height: number; top: number }

/** Takes a photo with the phone camera and reads the text on it (title page, cover or copyright page). */
export async function photoText(): Promise<TextLine[] | null> {
  let photo;
  try {
    photo = await Camera.getPhoto({ source: CameraSource.Camera, resultType: CameraResultType.Base64, quality: 85, width: 1600, correctOrientation: true, saveToGallery: false });
  } catch (err) {
    if (/cancel/i.test(String((err as Error)?.message))) return null;
    throw new Error("The camera could not start. Allow the camera for AklatOne in the phone's Settings > Apps, then try again.");
  }
  if (!photo.base64String) return null;
  const result = await CapacitorPluginMlKitTextRecognition.detectText({ base64Image: photo.base64String });
  return result.blocks.flatMap(b => b.lines).map(l => ({ text: l.text.trim(), height: l.boundingBox.bottom - l.boundingBox.top, top: l.boundingBox.top })).filter(l => l.text);
}
