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
              const sortedHands = [...results.landmarks].sort((a, b) => a[9].x - b[9].x);
              const rightHandRaw = sortedHands[0]; // Lower X (Left of image) -> User's Right Hand
              const leftHandRaw = sortedHands[1];  // Higher X (Right of image) -> User's Left Hand

              steering = calculateSteering(leftHandRaw, rightHandRaw); 
              throttle = calculateThrottle(rightHandRaw);
              debugMsg = "Drive Mode";

              // Visuals
              drawRealisticWheel(ctx, leftHandRaw, rightHandRaw, canvas.width, canvas.height, steering);
              
            } else if (results.landmarks.length === 1) {
              debugMsg = "Need 2 Hands";
              drawHandDebug(ctx, results.landmarks[0], canvas.width, canvas.height);
            }
          }
          
          // Always draw HUD (Speedometer) if tracking
          if (handsDetected === 2) {
             drawSpeedometer(ctx, canvas.width, canvas.height, throttle);
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


  // Draw a cool sci-fi steering yoke
  const drawRealisticWheel = (
    ctx: CanvasRenderingContext2D, 
    leftHand: any[], 
    rightHand: any[], 
    w: number, 
    h: number,
    steering: number
  ) => {
    const l = { x: leftHand[9].x * w, y: leftHand[9].y * h };
    const r = { x: rightHand[9].x * w, y: rightHand[9].y * h };

    // Calculate center and radius
    const cx = (l.x + r.x) / 2;
    const cy = (l.y + r.y) / 2;
    const dx = r.x - l.x;
    const dy = r.y - l.y;
    const diameter = Math.sqrt(dx*dx + dy*dy);
    const radius = diameter / 2; // Hand to Hand is the diameter roughly
    
    // Angle of the hands
    const angle = Math.atan2(dy, dx);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    // Glow
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00ffff';

    // 1. Central Hub
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fill();
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 3;
    ctx.stroke();

    // 2. The Yoke / Rim
    // We draw a path that looks like a racing wheel (flat top/bottom maybe?) or just a cool ring
    ctx.beginPath();
    // Left handle arc
    ctx.arc(0, 0, radius, Math.PI * 0.8, Math.PI * 1.2);
    // Top bar
    ctx.moveTo(radius * Math.cos(Math.PI * 1.2), radius * Math.sin(Math.PI * 1.2));
    ctx.quadraticCurveTo(0, -radius * 0.5, radius * Math.cos(Math.PI * 1.8), radius * Math.sin(Math.PI * 1.8));
    // Right handle arc
    ctx.arc(0, 0, radius, Math.PI * 1.8, Math.PI * 2.2);
    // Bottom bar
    ctx.moveTo(radius * Math.cos(Math.PI * 2.2), radius * Math.sin(Math.PI * 2.2));
    ctx.quadraticCurveTo(0, radius * 0.5, radius * Math.cos(Math.PI * 0.8), radius * Math.sin(Math.PI * 0.8));
    
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#00ffff';
    ctx.stroke();
    
    // Fill handles slightly
    ctx.fillStyle = 'rgba(0, 255, 255, 0.1)';
    ctx.fill();

    // 3. Connectors to Hands
    ctx.beginPath();
    ctx.moveTo(-radius * 0.8, 0);
    ctx.lineTo(radius * 0.8, 0);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // 4. Hand Grip Indicators
    // Left
    ctx.beginPath();
    ctx.arc(-radius, 0, 15, 0, Math.PI * 2);
    ctx.fillStyle = '#ff0055';
    ctx.fill();
    // Right
    ctx.beginPath();
    ctx.arc(radius, 0, 15, 0, Math.PI * 2);
    ctx.fillStyle = '#ff0055';
    ctx.fill();

    ctx.restore();
  };

  const drawSpeedometer = (ctx: CanvasRenderingContext2D, w: number, h: number, throttle: number) => {
      const cx = w - 80;
      const cy = h - 60;
      const r = 50;

      // Background
      ctx.beginPath();
      ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25);
      ctx.lineWidth = 10;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.stroke();

      // Gauge Arc
      ctx.beginPath();
      // Map throttle 0-1 to angle
      const startAngle = Math.PI * 0.75;
      const totalAngle = Math.PI * 1.5;
      const endAngle = startAngle + totalAngle * throttle;
      
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.lineWidth = 10;
      ctx.strokeStyle = `hsl(${180 - throttle * 180}, 100%, 50%)`; // Cyan to Red
      ctx.lineCap = 'round';
      ctx.stroke();

      // Text
      ctx.save();
      ctx.translate(cx, cy);
      // Because context is mirrored, we flip text back to readable?
      // No, as discussed, standard text drawing in mirrored ctx + CSS mirror = Readable.
      // But alignment might be tricky.
      
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 24px Orbitron';
      ctx.fillText(Math.floor(throttle * 100).toString() + '%', 0, 10);
      
      ctx.font = '10px Inter';
      ctx.fillStyle = '#aaa';
      ctx.fillText('POWER', 0, 25);
      ctx.restore();
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
      
      {/* Overlay Canvas - Also Mirrored via CSS to match video */}
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