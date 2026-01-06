import React, { useState, useCallback } from 'react';
import RacingGame from './components/RacingGame';
import WebcamController from './components/WebcamController';
import { ControlState, GameState } from './types';
import { Play, RotateCcw, Trophy, AlertTriangle, Zap, Gauge, Flame } from 'lucide-react';

export default function App() {
  const [gameState, setGameState] = useState<GameState>(GameState.MENU);
  const [lastScore, setLastScore] = useState(0);
  const [controlState, setControlState] = useState<ControlState>({
    steering: 0,
    throttle: 0,
    isTracking: false,
    handsDetected: 0,
    debugMessage: "Initializing..."
  });

  const handleControlUpdate = useCallback((newControl: ControlState) => {
    setControlState(newControl);
  }, []);

  const handleGameOver = useCallback((score: number) => {
    setLastScore(score);
    setGameState(GameState.GAME_OVER);
  }, []);

  const startGame = () => {
    setGameState(GameState.PLAYING);
  };

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden flex flex-col md:flex-row">
      
      {/* LEFT PANEL: GAME VIEW */}
      <div className="relative flex-1 h-2/3 md:h-full order-2 md:order-1">
        <RacingGame 
          controlState={controlState} 
          gameState={gameState} 
          onGameOver={handleGameOver} 
        />
        
        {/* HUD OVERLAY (Minimal - Main stats are now on canvas) */}
        <div className="absolute top-4 left-4 right-4 flex justify-between items-start pointer-events-none">
          <div className="flex flex-col gap-1">
            <h1 className="text-3xl font-black text-cyan-400 font-orbitron drop-shadow-[0_0_10px_rgba(34,211,238,0.8)] opacity-50">
              NEON RACER
            </h1>
          </div>
          
          <div className="text-right">
            <div className="bg-black/50 backdrop-blur-md p-2 rounded border border-cyan-500/30">
              <span className="text-cyan-400 font-bold block text-sm">STEERING</span>
              <div className="w-32 h-2 bg-gray-700 rounded-full mt-1 overflow-hidden relative">
                <div 
                  className="absolute top-0 bottom-0 w-2 bg-cyan-400 transition-all duration-75"
                  style={{ left: `${(controlState.steering + 1) * 50}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Direction Indicator */}
        {gameState === GameState.PLAYING && Math.abs(controlState.steering) > 0.3 && (
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none">
             <h2 className="text-6xl font-black text-yellow-400/80 animate-pulse font-orbitron tracking-tighter">
               {controlState.steering < 0 ? '<< LEFT' : 'RIGHT >>'}
             </h2>
          </div>
        )}

        {/* MENU OVERLAY */}
        {gameState === GameState.MENU && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="max-w-md w-full p-8 bg-zinc-900/90 border border-cyan-500/50 rounded-2xl shadow-[0_0_50px_rgba(6,182,212,0.3)] text-center">
              <h1 className="text-5xl font-black text-white font-orbitron mb-2 tracking-wider">NEON<br/><span className="text-cyan-400">RACER</span></h1>
              <p className="text-gray-400 mb-8 font-inter">Control the car with your bare hands.</p>
              
              <div className="grid grid-cols-2 gap-4 mb-8 text-left">
                <div className="bg-black/50 p-4 rounded-lg border border-gray-800">
                  <div className="flex items-center gap-2 text-cyan-400 mb-2 font-bold">
                    <RotateCcw size={20} /> Steering
                  </div>
                  <p className="text-xs text-gray-400">Hold hands like a wheel. Tilt to turn.</p>
                </div>
                <div className="bg-black/50 p-4 rounded-lg border border-gray-800">
                  <div className="flex items-center gap-2 text-yellow-400 mb-2 font-bold">
                    <Zap size={20} /> Throttle
                  </div>
                  <p className="text-xs text-gray-400">Pinch Right Hand to drive.</p>
                </div>
                <div className="col-span-2 bg-gradient-to-r from-blue-900/50 to-purple-900/50 p-4 rounded-lg border border-blue-500/50">
                   <div className="flex items-center justify-center gap-2 text-white mb-1 font-bold">
                    <Flame size={20} className="text-cyan-400" /> NEW: HYPER BOOST
                  </div>
                  <p className="text-center text-xs text-gray-300">Collect <span className="text-cyan-400 font-bold">BLUE ORBS</span> to charge boost. Fill the bar for invincibility and extreme speed!</p>
                </div>
              </div>

              <button 
                onClick={startGame}
                disabled={!controlState.isTracking}
                className={`w-full py-4 rounded-xl font-bold text-xl tracking-widest transition-all duration-300 flex items-center justify-center gap-2
                  ${controlState.isTracking 
                    ? 'bg-cyan-500 hover:bg-cyan-400 text-black shadow-[0_0_20px_rgba(6,182,212,0.6)]' 
                    : 'bg-gray-800 text-gray-500 cursor-not-allowed'
                  }`}
              >
                {controlState.isTracking ? <><Play fill="currentColor" /> START RACE</> : 'WAITING FOR HANDS...'}
              </button>
            </div>
          </div>
        )}

        {/* GAME OVER OVERLAY */}
        {gameState === GameState.GAME_OVER && (
          <div className="absolute inset-0 bg-red-900/80 backdrop-blur-md flex items-center justify-center z-50">
            <div className="text-center animate-in fade-in zoom-in duration-300">
              <AlertTriangle className="w-20 h-20 text-yellow-400 mx-auto mb-4" />
              <h2 className="text-6xl font-black text-white font-orbitron mb-2">CRASHED!</h2>
              <div className="flex items-center justify-center gap-2 text-2xl mb-8">
                <Trophy className="text-yellow-400" />
                <span className="font-mono text-white">SCORE: {lastScore}</span>
              </div>
              <button 
                onClick={startGame}
                className="bg-white text-red-900 px-8 py-3 rounded-full font-black hover:scale-105 transition-transform"
              >
                TRY AGAIN
              </button>
            </div>
          </div>
        )}
      </div>

      {/* RIGHT PANEL: VISION CONTROLLER */}
      <div className="w-full md:w-80 h-1/3 md:h-full bg-zinc-900 border-l border-gray-800 flex flex-col order-1 md:order-2 z-10">
        <div className="p-4 border-b border-gray-800 bg-black/20">
          <h3 className="text-cyan-400 font-orbitron text-sm font-bold tracking-widest flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${controlState.isTracking ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            VISION ENGINE
          </h3>
        </div>
        
        <div className="relative flex-1 min-h-0 bg-black">
          <WebcamController 
            onControlUpdate={handleControlUpdate} 
            isActive={gameState !== GameState.GAME_OVER}
          />
          
          {/* Controls Overlay Info */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black via-black/80 to-transparent">
             <div className="text-xs font-mono text-gray-400 space-y-1">
               <div className="flex justify-between">
                 <span>HANDS:</span>
                 <span className={controlState.handsDetected === 2 ? "text-green-400" : "text-yellow-500"}>
                   {controlState.handsDetected}/2
                 </span>
               </div>
               <div className="flex justify-between">
                 <span>STATUS:</span>
                 <span className="text-white">{controlState.debugMessage}</span>
               </div>
               <div className="mt-2 pt-2 border-t border-gray-800">
                 <div className="flex justify-between items-center">
                    <span>THROTTLE:</span>
                    <div className="w-20 h-1 bg-gray-700">
                      <div className="h-full bg-yellow-400" style={{ width: `${controlState.throttle * 100}%`}} />
                    </div>
                 </div>
               </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
