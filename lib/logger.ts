export function log(...args: any[]) {
  if (__DEV__) {
    console.log(...args);
  }
}
