import Token from "./Token"
import TokenType from "./TokenType"
import {
  Expr,
  BinaryExpr,
  GroupingExpr,
  LiteralExpr,
  UnaryExpr,
  Stmt,
  FunctionStmt,
  VariableExpr,
} from "./Ast"
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

      if (expr.type === "VariableExpr") {
        const name = expr.name
        return { type: "AssignExpr", name, value }
      } else if (expr.type === "GetExpr") {
        return { type: "SetExpr", object: expr.object, name: expr.name, value }
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
      expr = { type: "LogicalExpr", left: expr, operator, right }
    }

    return expr
  }

  and(): Expr {
    let expr = this.equality()

    while (this.match(TokenType.AND)) {
      const operator = this.previous()
      const right = this.equality()
      expr = { type: "LogicalExpr", left: expr, operator, right }
    }

    return expr
  }

  declaration(): Stmt | null {
    try {
      if (this.match(TokenType.CLASS)) return this.classDeclaration()
      if (this.match(TokenType.FUN)) return this.functionDeclaration("function")
      if (this.match(TokenType.VAR)) return this.varDeclaration()
      return this.statement()
    } catch (e) {
      this.synchronize()
      return null
    }
  }

  classDeclaration(): Stmt {
    const name = this.consume(TokenType.IDENTIFIER, "Expect class name.")

    let superclass: VariableExpr | null = null

    if (this.match(TokenType.LESS)) {
      this.consume(TokenType.IDENTIFIER, "Expect superclass name.")
      superclass = { type: "VariableExpr", name: this.previous() }
    }

    this.consume(TokenType.LEFT_BRACE, "Expect '{' before class body.")

    const methods = []
    while (!this.check(TokenType.RIGHT_BRACE) && !this.isAtEnd()) {
      methods.push(this.functionDeclaration("method"))
    }

    this.consume(TokenType.RIGHT_BRACE, "Expect '}' after class body.")

    return { type: "ClassStmt", methods, name, superclass }
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
    return { type: "FunctionStmt", name, params: parameters, body }
  }

  varDeclaration(): Stmt {
    const name = this.consume(TokenType.IDENTIFIER, "Expect variable name.")
    let initializer = this.match(TokenType.EQUAL) ? this.expression() : null

    this.consume(TokenType.SEMICOLON, "Expect ';' after variable declaration.")

    return { type: "VarStmt", name, initializer }
  }

  statement(): Stmt {
    if (this.match(TokenType.FOR)) return this.forStatement()
    if (this.match(TokenType.IF)) return this.ifStatement()
    if (this.match(TokenType.PRINT)) return this.printStatement()
    if (this.match(TokenType.RETURN)) return this.returnStatement()
    if (this.match(TokenType.WHILE)) return this.whileStatement()
    if (this.match(TokenType.LEFT_BRACE)) return { type: "BlockStmt", statements: this.block() }

    return this.expressionStatement()
  }

  returnStatement(): Stmt {
    const keyword = this.previous()
    let value = null
    if (!this.check(TokenType.SEMICOLON)) {
      value = this.expression()
    }

    this.consume(TokenType.SEMICOLON, "Expect ';' after return value")

    return { type: "ReturnStmt", keyword, value }
  }

  forStatement(): Stmt {
    this.consume(TokenType.LEFT_PAREN, "Expect '(' after 'for'.")

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
        type: "BlockStmt",
        statements: [body, { type: "ExpressionStmt", expression: increment }],
      }
    }

    if (!condition) condition = { type: "LiteralExpr", value: true }
    body = { type: "WhileStmt", condition, body }

    if (initializer) {
      body = { type: "BlockStmt", statements: [initializer, body] }
    }

    return body
  }

  whileStatement(): Stmt {
    this.consume(TokenType.LEFT_PAREN, "Expect '(' after 'while'.")
    const condition = this.expression()
    this.consume(TokenType.RIGHT_PAREN, "Exprect ')' after condition.")
    const body = this.statement()

    return { type: "WhileStmt", condition, body }
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

    return { type: "IfStmt", condition, thenBranch, elseBranch }
  }

  printStatement(): Stmt {
    const value = this.expression()
    this.consume(TokenType.SEMICOLON, "Expect ';' after value.")
    return { type: "PrintStmt", expression: value }
  }

  expressionStatement(): Stmt {
    const expr = this.expression()
    this.consume(TokenType.SEMICOLON, "Expect ';' after expression.")
    return { type: "ExpressionStmt", expression: expr }
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
      expr = { type: "BinaryExpr", left: expr, operator, right }
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
      expr = { type: "BinaryExpr", left: expr, operator, right }
    }

    return expr
  }

  addition(): Expr {
    let expr = this.multiplication()

    while (this.match(TokenType.MINUS, TokenType.PLUS)) {
      const operator = this.previous()
      const right = this.multiplication()
      expr = { type: "BinaryExpr", left: expr, operator, right }
    }

    return expr
  }

  multiplication(): Expr {
    let expr = this.unary()

    while (this.match(TokenType.SLASH, TokenType.STAR)) {
      const operator = this.previous()
      const right = this.unary()
      expr = { type: "BinaryExpr", left: expr, operator, right }
    }

    return expr
  }

  unary(): Expr {
    if (this.match(TokenType.BANG, TokenType.MINUS)) {
      const operator = this.previous()
      const right = this.unary()
      return { type: "UnaryExpr", operator, right }
    }

    return this.call()
  }

  call(): Expr {
    let expr = this.primary()
    while (true) {
      if (this.match(TokenType.LEFT_PAREN)) {
        expr = this.finishCall(expr)
      } else if (this.match(TokenType.DOT)) {
        const name = this.consume(TokenType.IDENTIFIER, "Expect property name after '.'.")
        expr = { type: "GetExpr", object: expr, name }
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
    return { type: "CallExpr", callee, paren, arguments: args }
  }

  primary(): Expr {
    if (this.match(TokenType.FALSE)) return { type: "LiteralExpr", value: false }
    if (this.match(TokenType.TRUE)) return { type: "LiteralExpr", value: true }

    if (this.match(TokenType.NIL)) return { type: "LiteralExpr", value: null }

    if (this.match(TokenType.NUMBER, TokenType.STRING)) {
      return { type: "LiteralExpr", value: this.previous().literal }
    }

    if (this.match(TokenType.SUPER)) {
      const keyword = this.previous()
      this.consume(TokenType.DOT, "Expect '.' after 'super'.")
      const method = this.consume(TokenType.IDENTIFIER, "Expect superclass method name.")
      return { type: "SuperExpr", keyword, method }
    }

    if (this.match(TokenType.THIS)) return { type: "ThisExpr", keyword: this.previous() }

    if (this.match(TokenType.IDENTIFIER)) {
      return { type: "VariableExpr", name: this.previous() }
    }

    if (this.match(TokenType.LEFT_PAREN)) {
      const expr = this.expression()
      this.consume(TokenType.RIGHT_PAREN, "Expect ')' after expression.")
      return { type: "GroupingExpr", expression: expr }
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
