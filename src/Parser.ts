import Token from "./Token"
import TokenType from "./TokenType"
import { Expr, Binary, Grouping, Literal, Unary, Stmt, FunctionStmt } from "./Ast"
import * as LoxError from "./Error"

export default class Parser {
  tokens: Token[] = []
  current = 0

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  parse(): Stmt[] {
    const statements: Stmt[] = []
    while (!this.isAtEnd()) {
      const result = this.declaration()
      if (result) {
        statements.push(result)
      }
    }
    return statements
  }

  expression(): Expr {
    return this.assignment()
  }

  assignment(): Expr {
    const expr = this.or()

    if (this.match(TokenType.EQUAL)) {
      const equals = this.previous()
      const value = this.assignment()

      if (expr.type === "variable") {
        const name = expr.name
        return { type: "assign", name, value }
      }

      this.error(equals, "Invalid assignment target.")
    }

    return expr
  }

  or(): Expr {
    let expr = this.and()

    while (this.match(TokenType.OR)) {
      const operator = this.previous()
      const right = this.and()
      expr = { type: "logical", left: expr, operator, right }
    }

    return expr
  }

  and(): Expr {
    let expr = this.equality()

    while (this.match(TokenType.AND)) {
      const operator = this.previous()
      const right = this.equality()
      expr = { type: "logical", left: expr, operator, right }
    }

    return expr
  }

  declaration(): Stmt | null {
    try {
      if (this.match(TokenType.FUN)) return this.functionDeclaration("function")
      if (this.match(TokenType.VAR)) return this.varDeclaration()
      return this.statement()
    } catch (e) {
      this.synchronize()
      return null
    }
  }

  functionDeclaration(kind: string): FunctionStmt {
    const name = this.consume(TokenType.IDENTIFIER, `Expect ${kind} name.`)
    this.consume(TokenType.LEFT_PAREN, `Expect '(' after ${kind} name.`)
    const parameters: Token[] = []
    if (!this.check(TokenType.RIGHT_PAREN)) {
      do {
        if (parameters.length >= 255) {
          this.error(this.peek(), "cannot have more than 255 parameters")
        }

        parameters.push(this.consume(TokenType.IDENTIFIER, "Expect parameter name."))
      } while (this.match(TokenType.COMMA))
    }
    this.consume(TokenType.RIGHT_PAREN, "Expect ')' after parameters.")

    this.consume(TokenType.LEFT_BRACE, "Expect '{' before " + kind + " body.")
    const body = this.block()
    return { type: "function statement", name, params: parameters, body }
  }

  varDeclaration(): Stmt {
    const name = this.consume(TokenType.IDENTIFIER, "Expect variable name.")
    let initializer = this.match(TokenType.EQUAL) ? this.expression() : null

    this.consume(TokenType.SEMICOLON, "Expect ';' after variable declaration.")

    return { type: "var statement", name, initializer }
  }

  statement(): Stmt {
    if (this.match(TokenType.FOR)) return this.forStatement()
    if (this.match(TokenType.IF)) return this.ifStatement()
    if (this.match(TokenType.PRINT)) return this.printStatement()
    if (this.match(TokenType.WHILE)) return this.whileStatement()
    if (this.match(TokenType.LEFT_BRACE))
      return { type: "block statement", statements: this.block() }

    return this.expressionStatement()
  }

  forStatement(): Stmt {
    this.consume(TokenType.LEFT_PAREN, "Exprect '(' after 'for'.")

    let initializer = null
    if (this.match(TokenType.SEMICOLON)) {
      initializer = null
    } else if (this.match(TokenType.VAR)) {
      initializer = this.varDeclaration()
    } else {
      initializer = this.expressionStatement()
    }

    let condition: Expr | null = null
    if (!this.check(TokenType.SEMICOLON)) {
      condition = this.expression()
    }

    this.consume(TokenType.SEMICOLON, "Exprect ';' after loop condition.")

    let increment

    if (!this.check(TokenType.RIGHT_PAREN)) {
      increment = this.expression()
    }
    this.consume(TokenType.RIGHT_PAREN, "Expect ')' after for clauses.")

    let body = this.statement()

    if (increment) {
      body = {
        type: "block statement",
        statements: [body, { type: "expression statement", expression: increment }],
      }
    }

    if (!condition) condition = { type: "literal", value: true }
    body = { type: "while statement", condition, body }

    if (initializer) {
      body = { type: "block statement", statements: [initializer, body] }
    }

    return body
  }

  whileStatement(): Stmt {
    this.consume(TokenType.LEFT_PAREN, "Expect '(' after 'while'.")
    const condition = this.expression()
    this.consume(TokenType.RIGHT_PAREN, "Exprect ')' after condition.")
    const body = this.statement()

    return { type: "while statement", condition, body }
  }

  ifStatement(): Stmt {
    this.consume(TokenType.LEFT_PAREN, "Expect '(' after if.")
    const condition = this.expression()
    this.consume(TokenType.RIGHT_PAREN, "Expect ')' after condition.")

    const thenBranch = this.statement()
    let elseBranch = null
    if (this.match(TokenType.ELSE)) {
      elseBranch = this.statement()
    }

    return { type: "if statement", condition, thenBranch, elseBranch }
  }

  printStatement(): Stmt {
    const value = this.expression()
    this.consume(TokenType.SEMICOLON, "Expect ';' after value.")
    return { type: "print statement", expression: value }
  }

  expressionStatement(): Stmt {
    const expr = this.expression()
    this.consume(TokenType.SEMICOLON, "Expect ';' after expression.")
    return { type: "expression statement", expression: expr }
  }

  block(): Stmt[] {
    const statements: Stmt[] = []

    while (!this.check(TokenType.RIGHT_BRACE) && !this.isAtEnd()) {
      const declaration = this.declaration()
      if (declaration) {
        statements.push(declaration)
      }
    }

    this.consume(TokenType.RIGHT_BRACE, "Expect '}' after block.")
    return statements
  }

  equality(): Expr {
    let expr = this.comparison()
    while (this.match(TokenType.BANG_EQUAL, TokenType.EQUAL_EQUAL)) {
      const operator = this.previous()
      const right = this.comparison()
      expr = { type: "binary", left: expr, operator, right }
    }
    return expr
  }

  comparison(): Expr {
    let expr = this.addition()

    while (
      this.match(TokenType.GREATER, TokenType.GREATER_EQUAL, TokenType.LESS, TokenType.LESS_EQUAL)
    ) {
      const operator = this.previous()
      const right = this.addition()
      expr = { type: "binary", left: expr, operator, right }
    }

    return expr
  }

  addition(): Expr {
    let expr = this.multiplication()

    while (this.match(TokenType.MINUS, TokenType.PLUS)) {
      const operator = this.previous()
      const right = this.multiplication()
      expr = { type: "binary", left: expr, operator, right }
    }

    return expr
  }

  multiplication(): Expr {
    let expr = this.unary()

    while (this.match(TokenType.SLASH, TokenType.STAR)) {
      const operator = this.previous()
      const right = this.unary()
      expr = { type: "binary", left: expr, operator, right }
    }

    return expr
  }

  unary(): Expr {
    if (this.match(TokenType.BANG, TokenType.MINUS)) {
      const operator = this.previous()
      const right = this.unary()
      return { type: "unary", operator, right }
    }

    return this.call()
  }

  call(): Expr {
    let expr = this.primary()
    while (true) {
      if (this.match(TokenType.LEFT_PAREN)) {
        expr = this.finishCall(expr)
      } else {
        break
      }
    }
    return expr
  }

  finishCall(callee: Expr): Expr {
    const args: Expr[] = []
    if (!this.check(TokenType.RIGHT_PAREN)) {
      do {
        if (args.length >= 255) {
          this.error(this.peek(), "Cannot have more than 255 arguments.")
        }
        args.push(this.expression())
      } while (this.match(TokenType.COMMA))
    }

    const paren = this.consume(TokenType.RIGHT_PAREN, "Expect ')' after arguments.")
    return { type: "call", callee, paren, arguments: args }
  }

  primary(): Expr {
    if (this.match(TokenType.FALSE)) return { type: "literal", value: false }
    if (this.match(TokenType.TRUE)) return { type: "literal", value: true }

    if (this.match(TokenType.NIL)) return { type: "literal", value: null }

    if (this.match(TokenType.NUMBER, TokenType.STRING)) {
      return { type: "literal", value: this.previous().literal }
    }

    if (this.match(TokenType.IDENTIFIER)) {
      return { type: "variable", name: this.previous() }
    }

    if (this.match(TokenType.LEFT_PAREN)) {
      const expr = this.expression()
      this.consume(TokenType.RIGHT_PAREN, "Expect ')' after expression.")
      return { type: "grouping", expression: expr }
    }

    throw this.error(this.peek(), "Expected expression")
  }

  match(...types: TokenType[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance()
        return true
      }
    }
    return false
  }

  consume(type: TokenType, message: string): Token {
    if (this.check(type)) return this.advance()

    throw this.error(this.peek(), message)
  }

  error(token: Token, message: string): Error {
    LoxError.tokenError(token, message)
    return new Error()
  }

  synchronize() {
    this.advance()

    while (!this.isAtEnd()) {
      if (this.previous().type === TokenType.SEMICOLON) return

      switch (this.peek().type) {
        case TokenType.CLASS:
        case TokenType.FUN:
        case TokenType.VAR:
        case TokenType.FOR:
        case TokenType.IF:
        case TokenType.WHILE:
        case TokenType.PRINT:
        case TokenType.RETURN:
          return
      }

      this.advance()
    }
  }

  check(type: TokenType): boolean {
    if (this.isAtEnd()) return false
    return this.peek().type == type
  }

  advance(): Token {
    if (!this.isAtEnd()) this.current++
    return this.previous()
  }

  isAtEnd() {
    return this.peek().type == TokenType.EOF
  }

  peek(): Token {
    return this.tokens[this.current]
  }

  previous(): Token {
    return this.tokens[this.current - 1]
  }
}
