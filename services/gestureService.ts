import { HandLandmarker, FilesetResolver, NormalizedLandmark } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/+esm";

let handLandmarker: HandLandmarker | undefined = undefined;
let runningMode: "IMAGE" | "VIDEO" = "VIDEO";

export const initializeHandLandmarker = async (): Promise<void> => {
  if (handLandmarker) return;

  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
  );

  handLandmarker = await HandLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
      delegate: "GPU",
    },
    runningMode: runningMode,
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
};

export const processVideoFrame = (video: HTMLVideoElement, timestamp: number) => {
  if (!handLandmarker) return null;
  return handLandmarker.detectForVideo(video, timestamp);
};

// Math helpers for steering logic
export const calculateSteering = (leftHand: NormalizedLandmark[], rightHand: NormalizedLandmark[]): number => {
  // Landmark 9 is the Middle Finger MCP (Knuckle) - stable point for "wheel" holding
  // Landmark 0 is Wrist - also stable.
  // Using Landmark 9 (Middle MCP) as requested in system prompt logic mostly, 
  // but let's stick to the prompt's request: "Angle between Left Hand (Landmark 9) and Right Hand (Landmark 9)"
  
  const leftPoint = leftHand[9];
  const rightPoint = rightHand[9];

  if (!leftPoint || !rightPoint) return 0;

  // Calculate slope
  const dy = rightPoint.y - leftPoint.y;
  const dx = rightPoint.x - leftPoint.x;

  // Angle in radians
  const angle = Math.atan2(dy, dx);
  
  // Convert to degrees for easier logic tuning
  const degrees = angle * (180 / Math.PI);

  // Normal holding is horizontal -> 0 degrees.
  // Turn Left -> Left hand down, Right hand up -> dy is negative -> negative angle.
  // Turn Right -> Left hand up, Right hand down -> dy is positive -> positive angle.
  // Wait! In screen space, Y increases downwards. 
  // Left Hand (Left side of screen) at x=0.3, y=0.5. Right Hand (Right side) at x=0.7, y=0.5.
  // Turn Left (steering wheel counter-clockwise): Left hand goes DOWN (Higher Y), Right hand goes UP (Lower Y).
  // Left Y = 0.7, Right Y = 0.3. 
  // dy = Right.y - Left.y = 0.3 - 0.7 = -0.4.
  // atan2(-0.4, 0.4) = -45 degrees.
  // So: Negative Angle = Left Turn. Positive Angle = Right Turn.

  // Clamp and Normalize
  // Max turn usually around 45 degrees
  const maxAngle = 45;
  let clamped = Math.max(-maxAngle, Math.min(maxAngle, degrees));
  
  // Normalize to -1 to 1
  return clamped / maxAngle; 
};

export const calculateThrottle = (hand: NormalizedLandmark[]): number => {
  // Distance between Thumb Tip (4) and Index Tip (8)
  const thumbTip = hand[4];
  const indexTip = hand[8];

  if (!thumbTip || !indexTip) return 0;

  const dist = Math.sqrt(
    Math.pow(thumbTip.x - indexTip.x, 2) + Math.pow(thumbTip.y - indexTip.y, 2)
  );

  // Calibration: 
  // Pinch (Closed) ~ 0.02 - 0.05
  // Open ~ 0.15 - 0.2
  // Logic: "Pinch to Accelerate" (Like pressing a gas pedal down)
  // OR "Open to Accelerate"?
  // The prompt says "Acceleration: Distance between...".
  // Let's implement: The smaller the distance (pinch), the higher the throttle. 
  // It feels more like "squeezing the throttle".

  const minPinch = 0.03; // Fully pressed
  const maxPinch = 0.15; // Fully released

  // Map dist to 0-1
  // If dist < minPinch -> 1.0 (Full Throttle)
  // If dist > maxPinch -> 0.0 (Idle)
  
  let throttle = 1 - ((dist - minPinch) / (maxPinch - minPinch));
  return Math.max(0, Math.min(1, throttle));
};
