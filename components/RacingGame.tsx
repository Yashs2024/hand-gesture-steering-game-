import React, { useEffect, useRef } from 'react';
import { ControlState, GameState } from '../types';

interface RacingGameProps {
  controlState: ControlState;
  gameState: GameState;
  onGameOver: (score: number) => void;
}

interface Entity {
  id: number;
  x: number;
  y: number;
  type: 'rock' | 'oil' | 'orb';
  active: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

const RacingGame: React.FC<RacingGameProps> = ({ controlState, gameState, onGameOver }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  
  const stateRef = useRef({
    playerX: 0, 
    speed: 0,
    roadOffset: 0,
    score: 0,
    distance: 0,
    boost: 0, // 0 to 100
    isBoosting: false,
    entities: [] as Entity[],
    particles: [] as Particle[],
    lastTime: 0,
    entityIdCounter: 0,
    bgOffset: 0,
  });

  // Sound Synthesis
  const playSound = (type: 'collect' | 'crash' | 'boost' | 'start') => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;

    if (type === 'collect') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, now);
      osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (type === 'crash') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(100, now);
      osc.frequency.exponentialRampToValueAtTime(10, now + 0.3);
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
      osc.start(now);
      osc.stop(now + 0.3);
    } else if (type === 'boost') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(200, now);
      osc.frequency.linearRampToValueAtTime(600, now + 0.5);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.linearRampToValueAtTime(0.0, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const ROAD_WIDTH_PCT = 0.5;
    const CAR_WIDTH = 50;
    const CAR_HEIGHT = 80;
    const HORIZON_Y = canvas.height * 0.35;

    const createExplosion = (x: number, y: number, color: string) => {
      for (let i = 0; i < 20; i++) {
        stateRef.current.particles.push({
          x, y,
          vx: (Math.random() - 0.5) * 400,
          vy: (Math.random() - 0.5) * 400,
          life: 1.0,
          maxLife: 1.0,
          color: color,
          size: Math.random() * 5 + 2
        });
      }
    };

    const gameLoop = (timestamp: number) => {
      if (stateRef.current.lastTime === 0) stateRef.current.lastTime = timestamp;
      const dt = Math.min((timestamp - stateRef.current.lastTime) / 1000, 0.1);
      stateRef.current.lastTime = timestamp;
      
      const state = stateRef.current; // Declared here for access in update and render

      const w = canvas.width;
      const h = canvas.height;
      const centerX = w / 2;
      
      // Dynamic Horizon
      const horizonY = h * 0.35;
      const roadBottomW = w * 0.9;
      const roadTopW = w * 0.1;

      // --- UPDATE LOGIC ---
      if (gameState === GameState.PLAYING) {
        const { steering, throttle } = controlState;

        // Physics Constants
        const steeringSensitivity = 1.8; 
        const acceleration = 0.8;
        const friction = 0.3;
        let maxSpeed = 1.5;

        // Boost Logic
        if (state.isBoosting) {
          maxSpeed = 2.5;
          state.boost -= 20 * dt; // Drain boost
          if (state.boost <= 0) {
            state.boost = 0;
            state.isBoosting = false;
          }
          // Boost Trail particles
          if (Math.random() > 0.5) {
             const px = centerX + state.playerX * (w * ROAD_WIDTH_PCT / 2);
             state.particles.push({
               x: px + (Math.random() - 0.5) * 30,
               y: h - 20,
               vx: (Math.random() - 0.5) * 50,
               vy: 200, // Move down fast
               life: 0.5,
               maxLife: 0.5,
               color: '#00ffff',
               size: 3
             });
          }
        }

        // Speed Update
        if (throttle > 0.1 || state.isBoosting) {
          const targetThrottle = state.isBoosting ? 1.0 : throttle;
          state.speed += targetThrottle * acceleration * dt;
        } else {
          state.speed -= friction * dt;
        }
        state.speed = Math.max(0, Math.min(maxSpeed, state.speed));

        // Player X Update
        if (state.speed > 0.05) {
          state.playerX += steering * steeringSensitivity * dt;
          state.playerX = Math.max(-1.2, Math.min(1.2, state.playerX)); // Slight allowance off-road
        }

        // World Movement
        const speedMultiplier = state.isBoosting ? 1500 : 1000;
        state.roadOffset += state.speed * speedMultiplier * dt;
        state.bgOffset += steering * state.speed * 50 * dt; // Parallax background
        state.distance += state.speed * dt;
        state.score += Math.floor(state.speed * 10 * (state.isBoosting ? 2 : 1));

        // Spawning
        const difficultyMultiplier = 1 + (state.distance / 500);
        // Obstacles (Rocks/Oil)
        if (Math.random() < 0.02 * state.speed * difficultyMultiplier) {
          state.entities.push({
            id: state.entityIdCounter++,
            x: (Math.random() * 2 - 1) * 0.9,
            y: horizonY, // Spawn at horizon
            type: Math.random() > 0.7 ? 'oil' : 'rock',
            active: true
          });
        }
        // Powerups (Orbs)
        if (Math.random() < 0.008) {
           state.entities.push({
            id: state.entityIdCounter++,
            x: (Math.random() * 2 - 1) * 0.9,
            y: horizonY,
            type: 'orb',
            active: true
          });
        }

        // Entity Updates
        // Projection helper
        const project = (roadX: number, roadY: number) => {
            // roadY is 0 at horizon, 1 at bottom
            // We store entity Y as screen Y initially? No, let's store Z (depth)
            // But to keep existing logic simple, let's adapt.
            // Existing logic had linear Y. Perspective needs Z.
            // Let's stick to a pseudo-3D Y for now: objects move from horizonY to h.
            return roadY;
        };

        for (let i = state.entities.length - 1; i >= 0; i--) {
          const ent = state.entities[i];
          // Move towards bottom. Speed depends on closeness (pseudo perspective speedup)
          // Simple exponential speedup to fake perspective
          const progress = (ent.y - horizonY) / (h - horizonY);
          const moveSpeed = state.speed * speedMultiplier * dt * (0.1 + progress * 2); 
          ent.y += moveSpeed;

          // Scale checks based on Y
          const scale = 0.2 + 0.8 * progress; // 0.2 at horizon, 1.0 at bottom
          
          // Collision Logic
          // Player is at bottom
          if (ent.y > h - 150 && ent.y < h + 50 && ent.active) {
            // Horizontal check
            // Road width at bottom is w * ROAD_WIDTH_PCT.
            // Entity X is -1 to 1 relative to road center.
            const roadWAtPlayer = w * ROAD_WIDTH_PCT;
            const entScreenX = centerX + ent.x * (roadWAtPlayer / 2);
            const playerScreenX = centerX + state.playerX * (roadWAtPlayer / 2);
            
            const hitDist = CAR_WIDTH * 0.8;
            
            if (Math.abs(entScreenX - playerScreenX) < hitDist) {
              if (ent.type === 'orb') {
                ent.active = false;
                state.boost = Math.min(100, state.boost + 25);
                state.score += 500;
                playSound('collect');
                createExplosion(entScreenX, ent.y, '#00ffff');
                
                // Trigger Boost?
                if (state.boost >= 100 && !state.isBoosting) {
                  state.isBoosting = true;
                  state.boost = 100;
                  playSound('boost');
                }
              } else if (!state.isBoosting) {
                // Crash
                playSound('crash');
                createExplosion(playerScreenX, h - 100, '#ffaa00');
                onGameOver(state.score);
              } else {
                // Destroy obstacle in boost mode
                ent.active = false;
                state.score += 100;
                createExplosion(entScreenX, ent.y, '#ffffff');
                playSound('collect'); // satisfying smash sound
              }
            }
          }

          if (ent.y > h + 100 || !ent.active) {
            state.entities.splice(i, 1);
          }
        }

        // Particle Updates
        for (let i = state.particles.length - 1; i >= 0; i--) {
          const p = state.particles[i];
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.life -= dt;
          if (p.life <= 0) state.particles.splice(i, 1);
        }
      }

      // --- RENDER ---
      // 1. Sky Gradient
      const gradSky = ctx.createLinearGradient(0, 0, 0, horizonY);
      gradSky.addColorStop(0, '#0a0a12');
      gradSky.addColorStop(1, '#2d1b4e');
      ctx.fillStyle = gradSky;
      ctx.fillRect(0, 0, w, horizonY);

      // 2. Retro Sun
      const sunY = horizonY - 50;
      ctx.save();
      ctx.shadowBlur = 40;
      ctx.shadowColor = '#ff0055';
      const gradSun = ctx.createLinearGradient(centerX, sunY - 80, centerX, sunY + 80);
      gradSun.addColorStop(0, '#ffff00');
      gradSun.addColorStop(1, '#ff0055');
      ctx.fillStyle = gradSun;
      ctx.beginPath();
      ctx.arc(centerX, sunY, 80, 0, Math.PI * 2);
      ctx.fill();
      // Sun cuts
      ctx.fillStyle = '#2d1b4e'; // Sky color to mask
      for(let i=0; i<5; i++) {
        const h = 8 + i * 3;
        const y = sunY + 20 + i * 15;
        ctx.fillRect(centerX - 90, y, 180, h * 0.4);
      }
      ctx.restore();

      // 3. Moving Grid Floor
      ctx.fillStyle = '#0f0f1a';
      ctx.fillRect(0, horizonY, w, h - horizonY);
      
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = '#ff00aa';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.3;
      
      // Vertical Grid Lines (Perspective)
      const fov = 300;
      for (let x = -w; x < w * 2; x += 100) {
         // Simple perspective projection roughly
         ctx.moveTo(x + state.bgOffset, horizonY);
         // Fan out
         const distFromCenter = x - centerX;
         ctx.lineTo(centerX + (distFromCenter + state.bgOffset) * 4, h);
      }
      
      // Horizontal Grid Lines (Moving)
      const gridSpeed = state.speed * 1000;
      const gridSpacing = 100;
      const gridOffset = (state.roadOffset % gridSpacing);
      
      // We want lines to get closer together near horizon
      // Pseudo-3D Z approach
      for (let z = 0; z < 1000; z+=100) {
         const effectiveZ = z - gridOffset;
         if (effectiveZ < 10) continue;
         const screenY = h - (50000 / (effectiveZ + 200)); // simple projection math
         if (screenY < horizonY) continue;
         
         ctx.moveTo(0, screenY);
         ctx.lineTo(w, screenY);
      }
      ctx.stroke();
      ctx.restore();

      // 4. Road
      ctx.save();
      ctx.beginPath();
      // Trapezoid Road
      const p1 = { x: centerX - roadTopW, y: horizonY };
      const p2 = { x: centerX + roadTopW, y: horizonY };
      const p3 = { x: centerX + roadBottomW * 0.6, y: h }; // slightly narrower at bottom than full screen
      const p4 = { x: centerX - roadBottomW * 0.6, y: h };
      
      // Clip road area
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.closePath();
      ctx.clip();

      // Draw Road Surface
      ctx.fillStyle = '#222';
      ctx.fillRect(0, 0, w, h);
      
      // Moving Lane Lines
      ctx.strokeStyle = state.isBoosting ? '#00ffff' : '#ffffff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      // Draw centered lane markers with perspective logic
      let laneOffset = -(state.roadOffset % 200);
      for (let i = 0; i < 20; i++) {
        const z = i * 200 + laneOffset;
        if (z < 10) continue;
        const scale = 1000 / (z + 1000);
        const y = h - (h - horizonY) * (1 - scale * 0.5); // fake mapping
        // Better linear interpolation for road strip
        // t goes 0 (horizon) to 1 (bottom)
        const t = (i * 0.1) - (state.roadOffset % 100) / 1000;
        // Simple manual drawing
        const ly = horizonY + (h - horizonY) * ((i % 10) / 10 + (state.roadOffset % 100)/1000 * 0.1);
        // This is getting messy, let's revert to simple 2D drawing projected to the trapezoid clip
      }
      // Re-do simple lines:
      const laneCount = 8;
      const phase = (state.roadOffset % 100) / 100; // 0 to 1
      for (let i = 0; i < laneCount; i++) {
        const t = (i + phase) / laneCount; // 0 (near) to 1 (far) - wait, 0 should be horizon
        // Let's go t=0 at horizon, t=1 at bottom
        const t2 = Math.pow((i + 1 - phase) / laneCount, 3); // exponential for perspective
        const y = horizonY + (h - horizonY) * t2;
        const yNext = horizonY + (h - horizonY) * Math.pow((i + 1.6 - phase) / laneCount, 3);
        const bw = 2 + t2 * 10;
        
        if (t2 > 0 && t2 < 1) {
           ctx.fillStyle = state.isBoosting ? '#00ffff' : '#fff';
           ctx.fillRect(centerX - bw/2, y, bw, (yNext - y) * 0.5);
        }
      }
      ctx.restore();

      // Road Borders (Neon)
      ctx.beginPath();
      ctx.strokeStyle = state.isBoosting ? '#00ffff' : '#ff0055';
      ctx.lineWidth = 4;
      ctx.shadowBlur = 10;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p4.x, p4.y);
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 5. Entities
      state.entities.forEach(ent => {
        // Simple projection scale
        const progress = (ent.y - horizonY) / (h - horizonY);
        const scale = 0.5 + progress * 2.5;
        const roadW = roadTopW * 2 + (roadBottomW * 0.6 * 2 - roadTopW * 2) * progress;
        const screenX = centerX + ent.x * (roadW / 2);
        
        if (ent.type === 'orb') {
          // Glow
          ctx.shadowBlur = 20;
          ctx.shadowColor = '#00ffff';
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(screenX, ent.y, 10 * scale, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#00ffff';
          ctx.beginPath();
          ctx.arc(screenX, ent.y, 6 * scale, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        } else if (ent.type === 'rock') {
          ctx.fillStyle = '#444';
          ctx.beginPath();
          ctx.arc(screenX, ent.y, 15 * scale, 0, Math.PI * 2);
          ctx.fill();
          // Highlight
          ctx.fillStyle = '#666';
          ctx.beginPath();
          ctx.arc(screenX - 5*scale, ent.y - 5*scale, 5 * scale, 0, Math.PI * 2);
          ctx.fill();
        } else {
           // Oil
           ctx.fillStyle = '#111';
           ctx.globalAlpha = 0.8;
           ctx.beginPath();
           ctx.ellipse(screenX, ent.y, 20 * scale, 10 * scale, 0, 0, Math.PI * 2);
           ctx.fill();
           ctx.globalAlpha = 1.0;
        }
      });

      // 6. Player Car
      const playerScreenY = h - 100;
      const playerRoadW = roadTopW * 2 + (roadBottomW * 0.6 * 2 - roadTopW * 2) * ((playerScreenY - horizonY)/(h - horizonY));
      const playerScreenX = centerX + state.playerX * (playerRoadW / 2);

      ctx.save();
      ctx.translate(playerScreenX, playerScreenY);
      ctx.rotate(controlState.steering * 0.3);

      // Shadow
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.ellipse(0, 20, CAR_WIDTH, CAR_HEIGHT/3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Body
      ctx.shadowBlur = state.isBoosting ? 30 : 10;
      ctx.shadowColor = state.isBoosting ? '#00ffff' : '#ff0055';
      ctx.fillStyle = '#000';
      ctx.fillRect(-CAR_WIDTH/2, -CAR_HEIGHT/2, CAR_WIDTH, CAR_HEIGHT);
      
      // Neon Trim
      ctx.strokeStyle = state.isBoosting ? '#ffffff' : '#00ffff';
      ctx.lineWidth = 3;
      ctx.strokeRect(-CAR_WIDTH/2, -CAR_HEIGHT/2, CAR_WIDTH, CAR_HEIGHT);

      // Engine Glow
      ctx.fillStyle = state.isBoosting ? '#fff' : '#ff5500';
      ctx.fillRect(-10, CAR_HEIGHT/2 - 5, 20, 10);
      
      // Windshield
      ctx.fillStyle = '#111';
      ctx.shadowBlur = 0;
      ctx.fillRect(-CAR_WIDTH/2 + 5, -CAR_HEIGHT/2 + 10, CAR_WIDTH - 10, 20);

      ctx.restore();

      // 7. Particles
      state.particles.forEach(p => {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      });
      ctx.globalAlpha = 1.0;


      // --- HUD ON CANVAS ---
      if (gameState === GameState.PLAYING) {
        // Boost Bar
        const barW = 200;
        const barH = 20;
        const barX = w / 2 - barW / 2;
        const barY = 30;

        // Label
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillText(state.isBoosting ? "HYPER BOOST ACTIVE!" : "BOOST", w/2, barY - 10);

        // BG
        ctx.fillStyle = '#333';
        ctx.fillRect(barX, barY, barW, barH);
        
        // Fill
        const fillW = (state.boost / 100) * barW;
        ctx.fillStyle = state.isBoosting ? '#fff' : '#00ffff';
        if (state.isBoosting) {
           ctx.shadowBlur = 15;
           ctx.shadowColor = '#00ffff';
        }
        ctx.fillRect(barX, barY, fillW, barH);
        ctx.shadowBlur = 0;
        
        // Border
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.strokeRect(barX, barY, barW, barH);

        // Score & Speed
        ctx.textAlign = 'right';
        ctx.font = '24px Orbitron';
        ctx.fillStyle = '#ffff00';
        ctx.fillText(`SCORE: ${state.score}`, w - 20, 40);
        
        ctx.textAlign = 'left';
        ctx.fillStyle = '#00ffff';
        const displaySpeed = Math.floor(state.speed * 180);
        ctx.fillText(`SPEED: ${displaySpeed} KM/H`, 20, 40);
      }

      animationFrameId = requestAnimationFrame(gameLoop);
    };

    animationFrameId = requestAnimationFrame(gameLoop);

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (audioCtxRef.current) audioCtxRef.current.close();
      audioCtxRef.current = null;
    };
  }, [controlState, gameState, onGameOver]);

  // Handle Resize
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return <canvas ref={canvasRef} className="block w-full h-full bg-zinc-900" />;
};

export default RacingGame;