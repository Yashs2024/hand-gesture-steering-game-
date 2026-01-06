import React, { useEffect, useRef, useState } from 'react';
import { initializeHandLandmarker, processVideoFrame, calculateSteering, calculateThrottle } from '../services/gestureService';
import { ControlState } from '../types';
import { Camera, RefreshCw } from 'lucide-react';

interface WebcamControllerProps {
  onControlUpdate: (control: ControlState) => void;
  isActive: boolean;
}

const WebcamController: React.FC<WebcamControllerProps> = ({ onControlUpdate, isActive }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [cameraPermission, setCameraPermission] = useState<boolean | null>(null);
  const requestRef = useRef<number | null>(null);

  // Initialize MediaPipe
  useEffect(() => {
    let mounted = true;
    initializeHandLandmarker()
      .then(() => {
        if (mounted) setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load MediaPipe", err);
      });
    return () => { mounted = false; };
  }, []);

  // Initialize Camera
  useEffect(() => {
    const startCamera = async () => {
      if (!videoRef.current) return;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: 640,
            height: 480,
            frameRate: { ideal: 30 } // Optimize for performance
          }
        });
        videoRef.current.srcObject = stream;
        videoRef.current.addEventListener('loadeddata', () => {
          setCameraPermission(true);
        });
      } catch (err) {
        console.error("Camera error", err);
        setCameraPermission(false);
      }
    };

    startCamera();
  }, []);

  // Processing Loop
  useEffect(() => {
    if (!isActive || loading || !cameraPermission) return;

    let lastVideoTime = -1;

    const renderLoop = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      if (video && canvas && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const results = processVideoFrame(video, Date.now());

        const ctx = canvas.getContext('2d');
        if (ctx) {
          // Clear and set dimensions to match video
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          
          // Mirror transform for drawing to match the mirrored video css
          ctx.save();
          ctx.scale(-1, 1);
          ctx.translate(-canvas.width, 0);

          let steering = 0;
          let throttle = 0;
          let handsDetected = 0;
          let debugMsg = "Show Hands";

          if (results && results.landmarks) {
            handsDetected = results.landmarks.length;
            
            // Logic for 2 hands (Steering)
            if (results.landmarks.length === 2) {
              // We need to identify Left vs Right.
              // MediaPipe MultiHandLandmarker often returns handedness, but strictly by X coordinate is robust for a driver facing camera.
              // The hand on the "Left" of the raw image (x < 0.5) is the user's Right Hand if mirrored?
              // Let's rely on x-sorting. 
              // Raw Video: User's Right hand is on the LEFT side of the image (low x).
              // User's Left hand is on the RIGHT side of the image (high x).
              
              const sortedHands = [...results.landmarks].sort((a, b) => a[9].x - b[9].x);
              const rightHandRaw = sortedHands[0]; // Lower X (Left of image) -> User's Right Hand
              const leftHandRaw = sortedHands[1];  // Higher X (Right of image) -> User's Left Hand

              // Wait, calculating steering slope requires consistency.
              // Let's pass the raw sorted hands.
              // In the raw frame:
              // P1 (Right Hand) at x=0.2. P2 (Left Hand) at x=0.8.
              // User tilts Left (Wheel CCW): Right Hand (P1) goes UP (low y), Left Hand (P2) goes DOWN (high y).
              // P1.y = 0.3, P2.y = 0.7.
              // calculateSteering logic: dy = P2.y - P1.y = 0.7 - 0.3 = 0.4.
              // atan(0.4, 0.6) -> Positive Angle.
              // So for this sorting, Positive = Left Turn?
              // Let's correct the service logic or mapping here.
              // If we pass (LeftHandRaw, RightHandRaw) to the service:
              // Service expects (LeftHand, RightHand).
              // User's Left Hand is "leftHandRaw" (High X in raw image).
              // User's Right Hand is "rightHandRaw" (Low X in raw image).
              
              // Let's pass (leftHandRaw, rightHandRaw) -> (UserLeft, UserRight).
              steering = calculateSteering(leftHandRaw, rightHandRaw); 
              // Note: If I pass them in this order, the math in service needs to match.
              // Service: dy = Right.y - Left.y.
              // Turn Left Case: Right(UP/0.3) - Left(DOWN/0.7) = -0.4.
              // Result: Negative.
              // So Negative = Left Turn. This matches the service logic. Good.

              // Throttle: Use Right Hand (rightHandRaw)
              throttle = calculateThrottle(rightHandRaw);
              debugMsg = "Drive Mode";

              // Visuals
              drawVirtualWheel(ctx, leftHandRaw, rightHandRaw, canvas.width, canvas.height, steering);
            } else if (results.landmarks.length === 1) {
              debugMsg = "Need 2 Hands";
              drawHandDebug(ctx, results.landmarks[0], canvas.width, canvas.height);
            }
          }

          ctx.restore();

          onControlUpdate({
            steering,
            throttle,
            isTracking: handsDetected === 2,
            handsDetected,
            debugMessage: debugMsg
          });
        }
      }

      requestRef.current = requestAnimationFrame(renderLoop);
    };

    requestRef.current = requestAnimationFrame(renderLoop);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [isActive, loading, cameraPermission, onControlUpdate]);


  // Helper to draw the virtual wheel
  const drawVirtualWheel = (
    ctx: CanvasRenderingContext2D, 
    leftHand: any[], 
    rightHand: any[], 
    w: number, 
    h: number,
    steering: number
  ) => {
    const l = { x: leftHand[9].x * w, y: leftHand[9].y * h };
    const r = { x: rightHand[9].x * w, y: rightHand[9].y * h };

    // Line connecting hands
    ctx.beginPath();
    ctx.strokeStyle = "rgba(0, 255, 255, 0.5)";
    ctx.lineWidth = 4;
    ctx.moveTo(l.x, l.y);
    ctx.lineTo(r.x, r.y);
    ctx.stroke();

    // Hands
    ctx.fillStyle = "#00FFFF";
    ctx.beginPath();
    ctx.arc(l.x, l.y, 10, 0, 2 * Math.PI);
    ctx.arc(r.x, r.y, 10, 0, 2 * Math.PI);
    ctx.fill();

    // Center point
    const cx = (l.x + r.x) / 2;
    const cy = (l.y + r.y) / 2;
    
    // Draw arc visualizing steering
    ctx.beginPath();
    ctx.strokeStyle = steering < -0.2 ? "#FF0055" : (steering > 0.2 ? "#FF0055" : "#00FF00"); // Red if turning hard
    ctx.lineWidth = 8;
    // Draw a semi-circle oriented by the steering angle
    // Base angle is the slope of the line
    const baseAngle = Math.atan2(r.y - l.y, r.x - l.x);
    ctx.arc(cx, cy, 60, baseAngle + Math.PI, baseAngle, false); 
    ctx.stroke();

    // Throttle Indicator (Pinch visual on Right hand)
    // Draw near Right hand
    const rThumb = { x: rightHand[4].x * w, y: rightHand[4].y * h };
    const rIndex = { x: rightHand[8].x * w, y: rightHand[8].y * h };
    
    ctx.beginPath();
    ctx.strokeStyle = "#FFFF00";
    ctx.lineWidth = 2;
    ctx.moveTo(rThumb.x, rThumb.y);
    ctx.lineTo(rIndex.x, rIndex.y);
    ctx.stroke();
  };

  const drawHandDebug = (ctx: CanvasRenderingContext2D, hand: any[], w: number, h: number) => {
     for (const lm of hand) {
       ctx.beginPath();
       ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
       ctx.arc(lm.x * w, lm.y * h, 4, 0, 2 * Math.PI);
       ctx.fill();
     }
  };

  return (
    <div className="relative w-full h-full overflow-hidden rounded-xl bg-black border border-gray-800 shadow-2xl">
      {/* Video Feed - Mirrored for natural interaction */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute inset-0 w-full h-full object-cover transform scale-x-[-1] opacity-60"
      />
      
      {/* Overlay Canvas - Also Mirrored via CSS to match video, context logic handles internal coord flip if needed, but here we flipped context instead. */}
       <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover transform scale-x-[-1]"
      />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
          <div className="text-cyan-400 animate-pulse flex flex-col items-center">
            <RefreshCw className="w-8 h-8 animate-spin mb-2" />
            <span className="font-orbitron tracking-widest">LOADING VISION ENGINE...</span>
          </div>
        </div>
      )}

      {!cameraPermission && !loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-20 text-center p-4">
           <div className="text-red-500 flex flex-col items-center">
            <Camera className="w-12 h-12 mb-2" />
            <span className="font-bold">Camera Access Required</span>
            <p className="text-sm text-gray-400 mt-2">Please allow camera access to drive.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default WebcamController;