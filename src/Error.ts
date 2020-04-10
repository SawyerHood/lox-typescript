import Token from './Token'
import TokenType from './TokenType'

let hadError = false

export function error(line: number, message: string) {
  report(line, '', message)
}

function report(line: number, where: string, message: string) {
  console.error(`[line ${line}] Error ${where}: ${message}`)
  hadError = true
}

export function tokenError(token: Token, message: string) {
  if (token.type === TokenType.EOF) {
    report(token.line, ' at end', message)
  } else {
    report(token.line, " at '" + token.lexeme + "'", message)
  }
}

export function setHadError(e: boolean) {
  hadError = e
}

export function getHadError(): boolean {
  return hadError
}
