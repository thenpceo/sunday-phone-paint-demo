import type { BFMatcher, CV, KeyPointVector, Mat } from "@techstark/opencv-js";

const OPENCV_SCRIPT = "/vendor/opencv.js";
const REFERENCE_WIDTH = 840;
const FRAME_MAX_SIZE = 480;
const LOWE_RATIO = 0.74;
const MIN_MATCHES = 10;
const MIN_INLIERS = 8;

type Reference = {
  name: "start" | "hidden";
  width: number;
  height: number;
  keypoints: KeyPointVector;
  descriptors: Mat;
};

export type ArtworkTrack = {
  x: number;
  y: number;
  confidence: number;
  reference: Reference["name"];
  matches: number;
  inliers: number;
};

export type ArtworkTracker = {
  locate(video: HTMLVideoElement, canvas: HTMLCanvasElement): ArtworkTrack | null;
  dispose(): void;
};

let openCvPromise: Promise<CV> | null = null;

function waitForOpenCv() {
  if (openCvPromise) return openCvPromise;
  openCvPromise = new Promise<CV>((resolve, reject) => {
    const finish = async () => {
      try {
        const candidate = (window as typeof window & { cv?: CV | Promise<CV> }).cv;
        const cv = candidate instanceof Promise ? await candidate : candidate;
        if (cv?.Mat) resolve(cv);
        else if (candidate) candidate.onRuntimeInitialized = () => resolve(candidate);
        else reject(new Error("OpenCV did not initialize"));
      } catch (error) { reject(error); }
    };
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${OPENCV_SCRIPT}"]`);
    if (existing) {
      if ((window as typeof window & { cv?: CV | Promise<CV> }).cv) void finish();
      else {
        existing.addEventListener("load", () => void finish(), { once: true });
        existing.addEventListener("error", () => reject(new Error("OpenCV failed to load")), { once: true });
      }
      return;
    }
    const script = document.createElement("script");
    script.src = OPENCV_SCRIPT;
    script.async = true;
    script.addEventListener("load", () => void finish(), { once: true });
    script.addEventListener("error", () => reject(new Error("OpenCV failed to load")), { once: true });
    document.head.appendChild(script);
  });
  return openCvPromise;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load reference artwork: ${src}`));
    image.src = src;
  });
}

function makeReference(cv: CV, image: HTMLImageElement, name: Reference["name"]): Reference {
  const height = Math.round((REFERENCE_WIDTH * image.naturalHeight) / image.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = REFERENCE_WIDTH;
  canvas.height = height;
  canvas.getContext("2d")?.drawImage(image, 0, 0, REFERENCE_WIDTH, height);
  const source = cv.imread(canvas);
  const gray = new cv.Mat();
  const mask = new cv.Mat();
  const keypoints = new cv.KeyPointVector();
  const descriptors = new cv.Mat();
  const orb = new cv.ORB(1800, 1.2, 8, 24, 0, 2, cv.ORB_HARRIS_SCORE, 31, 12);
  try {
    cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
    orb.detectAndCompute(gray, mask, keypoints, descriptors);
  } finally {
    source.delete(); gray.delete(); mask.delete(); orb.delete();
  }
  return { name, width: REFERENCE_WIDTH, height, keypoints, descriptors };
}

function matchReference(
  cv: CV,
  frameKeypoints: KeyPointVector,
  frameDescriptors: Mat,
  frameWidth: number,
  frameHeight: number,
  reference: Reference,
  matcher: BFMatcher,
): ArtworkTrack | null {
  if (!frameDescriptors.rows || !reference.descriptors.rows) return null;
  const matches = new cv.DMatchVectorVector();
  const sourceCoordinates: number[] = [];
  const destinationCoordinates: number[] = [];
  let sourcePoints: Mat | null = null;
  let destinationPoints: Mat | null = null;
  let inlierMask: Mat | null = null;
  let homography: Mat | null = null;
  try {
    matcher.knnMatch(frameDescriptors, reference.descriptors, matches, 2);
    for (let index = 0; index < matches.size(); index += 1) {
      const pair = matches.get(index);
      try {
        if (pair.size() < 2) continue;
        const best = pair.get(0);
        const second = pair.get(1);
        if (best.distance >= second.distance * LOWE_RATIO) continue;
        const framePoint = frameKeypoints.get(best.queryIdx).pt;
        const referencePoint = reference.keypoints.get(best.trainIdx).pt;
        sourceCoordinates.push(framePoint.x, framePoint.y);
        destinationCoordinates.push(referencePoint.x, referencePoint.y);
      } finally { pair.delete(); }
    }
    const goodMatches = sourceCoordinates.length / 2;
    if (goodMatches < MIN_MATCHES) return null;
    sourcePoints = cv.matFromArray(goodMatches, 1, cv.CV_32FC2, sourceCoordinates);
    destinationPoints = cv.matFromArray(goodMatches, 1, cv.CV_32FC2, destinationCoordinates);
    inlierMask = new cv.Mat();
    homography = cv.findHomography(sourcePoints, destinationPoints, cv.RANSAC, 4, inlierMask);
    if (!homography || homography.empty()) return null;
    let inliers = 0;
    for (const value of inlierMask.data) inliers += value ? 1 : 0;
    const ratio = inliers / goodMatches;
    if (inliers < MIN_INLIERS || ratio < 0.34) return null;
    const h: Float64Array = homography.data64F;
    const frameX = frameWidth / 2;
    const frameY = frameHeight / 2;
    const divisor = h[6] * frameX + h[7] * frameY + h[8];
    if (!Number.isFinite(divisor) || Math.abs(divisor) < 0.0001) return null;
    const x = (h[0] * frameX + h[1] * frameY + h[2]) / divisor / reference.width;
    const y = (h[3] * frameX + h[4] * frameY + h[5]) / divisor / reference.height;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < -0.08 || x > 1.08 || y < -0.08 || y > 1.08) return null;
    return {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
      confidence: Math.min(1, ratio * Math.min(1, inliers / 18)),
      reference: reference.name,
      matches: goodMatches,
      inliers,
    };
  } finally {
    homography?.delete(); inlierMask?.delete(); sourcePoints?.delete(); destinationPoints?.delete(); matches.delete();
  }
}

export async function createArtworkTracker(): Promise<ArtworkTracker> {
  const [cv, startImage, hiddenImage] = await Promise.all([
    waitForOpenCv(), loadImage("/artwork/hero-start.webp"), loadImage("/media/hidden-hero-poster.webp"),
  ]);
  const references = [makeReference(cv, startImage, "start"), makeReference(cv, hiddenImage, "hidden")];
  const matcher = new cv.BFMatcher(cv.NORM_HAMMING, false);
  const frameOrb = new cv.ORB(800, 1.2, 7, 18, 0, 2, cv.ORB_HARRIS_SCORE, 31, 9);
  let preferred: Reference["name"] = "start";
  let disposed = false;
  return {
    locate(video, canvas) {
      if (disposed || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
      const sourceWidth = video.videoWidth;
      const sourceHeight = video.videoHeight;
      if (!sourceWidth || !sourceHeight) return null;
      const scale = FRAME_MAX_SIZE / Math.max(sourceWidth, sourceHeight);
      const width = Math.round(sourceWidth * scale);
      const height = Math.round(sourceHeight * scale);
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return null;
      context.drawImage(video, 0, 0, width, height);
      const source = cv.imread(canvas);
      const gray = new cv.Mat();
      const mask = new cv.Mat();
      const keypoints = new cv.KeyPointVector();
      const descriptors = new cv.Mat();
      try {
        cv.cvtColor(source, gray, cv.COLOR_RGBA2GRAY);
        frameOrb.detectAndCompute(gray, mask, keypoints, descriptors);
        const primary = references.find((item) => item.name === preferred) ?? references[0];
        const secondary = references.find((item) => item.name !== primary.name) ?? references[1];
        const first = matchReference(cv, keypoints, descriptors, width, height, primary, matcher);
        if (first) return first;
        const second = matchReference(cv, keypoints, descriptors, width, height, secondary, matcher);
        if (second) preferred = second.reference;
        return second;
      } finally {
        source.delete(); gray.delete(); mask.delete(); keypoints.delete(); descriptors.delete();
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      frameOrb.delete(); matcher.delete();
      for (const reference of references) { reference.keypoints.delete(); reference.descriptors.delete(); }
    },
  };
}
