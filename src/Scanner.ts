import TokenType from './TokenType'
import Token from './Token'
import {error} from './Error'

export default class Scanner {
  private source: string = ''
  private tokens: Token[] = []
  private start: number = 0
  private current: number = 0
  private line: number = 1

  constructor(source: string) {
    this.source = source
  }

  scanTokens(): Token[] {
    while (!this.isAtEnd()) {
      this.start = this.current
      this.scanToken()
    }
    this.tokens.push({type: TokenType.EOF, lexeme: '', literal: null, line: this.line})
    return this.tokens
  }

  private isAtEnd(): boolean {
    return this.current >= this.source.length
  }

  private scanToken() {
    const c = this.advance()
    switch (c) {
      case '(':
        this.addToken(TokenType.LEFT_PAREN)
        break
      case ')':
        this.addToken(TokenType.RIGHT_PAREN)
        break
      case '{':
        this.addToken(TokenType.LEFT_BRACE)
        break
      case '}':
        this.addToken(TokenType.RIGHT_BRACE)
        break
      case ',':
        this.addToken(TokenType.COMMA)
        break
      case '.':
        this.addToken(TokenType.DOT)
        break
      case '-':
        this.addToken(TokenType.MINUS)
        break
      case '+':
        this.addToken(TokenType.PLUS)
        break
      case ';':
        this.addToken(TokenType.SEMICOLON)
        break
      case '*':
        this.addToken(TokenType.STAR)
        break
      case '!':
        this.addToken(this.match('=') ? TokenType.BANG_EQUAL : TokenType.BANG)
        break
      case '=':
        this.addToken(this.match('=') ? TokenType.EQUAL_EQUAL : TokenType.EQUAL)
        break
      case '<':
        this.addToken(this.match('=') ? TokenType.LESS_EQUAL : TokenType.LESS)
        break
      case '>':
        this.addToken(this.match('=') ? TokenType.GREATER_EQUAL : TokenType.GREATER)
        break
      case '/':
        if (this.match('/')) {
          // A comment goes until the end of the line.
          while (this.peek() != '\n' && !this.isAtEnd()) this.advance()
        } else {
          this.addToken(TokenType.SLASH)
        }
        break
      case ' ':
      case '\r':
      case '\t':
        // Ignore whitespace.
        break

      case '\n':
        this.line++
        break

      case '"':
        this.string()
        break

      default:
        if (this.isDigit(c)) {
          this.number()
        } else if (this.isAlpha(c)) {
          this.identifier()
        } else {
          error(this.line, 'Unexpected character')
        }
        break
    }
  }

  private advance(): string {
    this.current++
    return this.source.charAt(this.current - 1)
  }

  private addToken(type: TokenType) {
    this.addTokenWithLiteral(type, null)
  }

  private addTokenWithLiteral(type: TokenType, literal: any | null) {
    const text = this.source.substring(this.start, this.current)
    this.tokens.push({type, lexeme: text, literal, line: this.line})
  }

  private match(expected: string): boolean {
    if (this.isAtEnd()) return false
    if (this.source.charAt(this.current) != expected) return false

    this.current++
    return true
  }

  private peek(): string {
    if (this.isAtEnd()) return '\0'
    return this.source.charAt(this.current)
  }

  private string() {
    while (this.peek() != '"') {
      if (this.peek() == '\n') this.line++
      this.advance()
    }

    if (this.isAtEnd()) {
      error(this.line, 'Unterminated string.')
      return
    }

    this.advance()

    const value = this.source.substring(this.start + 1, this.current - 1)
    this.addTokenWithLiteral(TokenType.STRING, value)
  }

  private isDigit(c: string) {
    return c >= '0' && c <= '9'
  }

  private number() {
    while (this.isDigit(this.peek())) this.advance()

    // Look for a fractional part.
    if (this.peek() == '.' && this.isDigit(this.peekNext())) {
      // Consume the "."
      this.advance()

      while (this.isDigit(this.peek())) this.advance()
    }

    this.addTokenWithLiteral(
      TokenType.NUMBER,
      parseFloat(this.source.substring(this.start, this.current)),
    )
  }

  private peekNext(): string {
    if (this.current + 1 >= this.source.length) return '\0'
    return this.source.charAt(this.current + 1)
  }

  private identifier() {
    while (this.isAlphaNumeric(this.peek())) this.advance()

    const text = this.source.substring(this.start, this.current)

    let type = keywords.get(text)
    if (type == null) type = TokenType.IDENTIFIER

    this.addToken(type)
  }

  private isAlpha(c: string) {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_'
  }

  private isAlphaNumeric(c: string): boolean {
    return this.isAlpha(c) || this.isDigit(c)
  }
}

const keywords = new Map([
  ['and', TokenType.AND],
  ['class', TokenType.CLASS],
  ['else', TokenType.ELSE],
  ['false', TokenType.FALSE],
  ['for', TokenType.FOR],
  ['fun', TokenType.FUN],
  ['if', TokenType.IF],
  ['nil', TokenType.NIL],
  ['or', TokenType.OR],
  ['print', TokenType.PRINT],
  ['return', TokenType.RETURN],
  ['super', TokenType.SUPER],
  ['this', TokenType.THIS],
  ['true', TokenType.TRUE],
  ['var', TokenType.VAR],
  ['while', TokenType.WHILE],
])
