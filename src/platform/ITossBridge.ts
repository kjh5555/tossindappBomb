export interface SafeArea {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface ITossBridge {
  init(): Promise<void>;
  getSafeArea(): SafeArea;
  getUserToken(): string;
}
