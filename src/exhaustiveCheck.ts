export function exhaustiveCheck(param: never): never {
  throw new Error("should not reach here")
}
