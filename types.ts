export interface ControlState {
  steering: number; // -1 (Left) to 1 (Right)
  throttle: number; // 0 (Idle) to 1 (Full Speed)
  isTracking: boolean;
  handsDetected: number;
  debugMessage?: string;
}

export enum GameState {
  MENU,
  PLAYING,
  GAME_OVER
}

export interface Point {
  x: number;
  y: number;
}
