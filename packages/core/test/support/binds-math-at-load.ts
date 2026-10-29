// Keeps its own reference to Math.cos when it loads, as some libraries do. The guard's own test
// imports it after the guard, to show the guard reaches such a reference.
export const cosAtLoad = Math.cos;
