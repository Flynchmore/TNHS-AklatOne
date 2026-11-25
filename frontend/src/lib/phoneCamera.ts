import { Capacitor } from "@capacitor/core";
import { BarcodeScanner, BarcodeFormat } from "@capacitor-mlkit/barcode-scanning";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { CapacitorPluginMlKitTextRecognition } from "@pantrist/capacitor-plugin-ml-kit-text-recognition";

// Phone camera through Google ML Kit (on the phone itself: offline, no HTTPS needed, no web camera permission).
// Android only: the iOS project uses Swift Package Manager, which these two ML Kit plugins do not support yet, so
// iPhones keep the web camera scanner and typing.
export const nativeQr = () => Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("BarcodeScanner");
export const nativeOcr = () => Capacitor.getPlatform() === "android" && Capacitor.isPluginAvailable("CapacitorPluginMlKitTextRecognition");

/** Opens the phone's QR scanner screen; returns the code, or null when the member closes it. Throws with a readable message. */
export async function scanQr(): Promise<string | null> {
  const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
  if (!available) {
    await BarcodeScanner.installGoogleBarcodeScannerModule();
    throw new Error("The QR scanner is being downloaded to this phone (one time only). Try again in a minute.");
  }
  try {
    const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode], autoZoom: true });
    return barcodes[0]?.rawValue ?? null;
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
