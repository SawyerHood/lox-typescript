import { Expr, Unary, Binary, Stmt } from "./Ast"
import TokenType from "./TokenType"
import Token from "./Token"
import { runtimeError } from "./Error"
import Environment from "./Enviornment"

let environment = new Environment()

export default function interpret(statements: Stmt[]) {
  try {
    for (const stmt of statements) {
      evaluateStmt(stmt)
    }
  } catch (e) {
    runtimeError(e)
  }
}

function evaluateStmt(stmt: Stmt): void {
  switch (stmt.type) {
    case "expression statement": {
      evaluate(stmt.expression)
      return
    }
    case "print statement": {
      const val = evaluate(stmt.expression)
      console.log(val ?? "nil")
      return
    }
    case "var statement": {
      const val = stmt.initializer ? evaluate(stmt.initializer) : null

      environment.define(stmt.name.lexeme, val)
      return
    }
    case "block statement": {
      evaluateBlock(stmt.statements, new Environment(environment))
    }
  }
}

function evaluateBlock(statements: Stmt[], env: Environment) {
  const previous = environment
  try {
    environment = env
    for (const statement of statements) {
      evaluateStmt(statement)
    }
  } finally {
    environment = previous
  }
}

function evaluate(expr: Expr): any {
  switch (expr.type) {
    case "literal":
      return expr.value
    case "grouping":
      return evaluate(expr.expression)
    case "unary":
      return evaluateUnary(expr)
    case "binary":
      return evaluateBinary(expr)
    case "variable":
      return environment.get(expr.name)
    case "assign":
      const value = evaluate(expr.value)
      environment.assign(expr.name, value)
      return value
  }
}

function evaluateUnary(expr: Unary): any {
  const right = evaluate(expr.right)

  switch (expr.operator.type) {
    case TokenType.BANG:
      return !isTruthy(right)
    case TokenType.MINUS:
      checkNumberOperand(expr.operator, right)
      return -right
  }
}

function evaluateBinary(expr: Binary): any {
  const left = evaluate(expr.left)
  const right = evaluate(expr.right)

  switch (expr.operator.type) {
    case TokenType.GREATER:
      checkNumberOperands(expr.operator, left, right)
      return left > right
    case TokenType.GREATER_EQUAL:
      checkNumberOperands(expr.operator, left, right)
      return left >= right
    case TokenType.LESS:
      checkNumberOperands(expr.operator, left, right)
      return left < right
    case TokenType.LESS_EQUAL:
      checkNumberOperands(expr.operator, left, right)
      return left <= right
    case TokenType.MINUS:
      checkNumberOperands(expr.operator, left, right)
      return left - right
    case TokenType.PLUS:
      if (typeof left === "number" && typeof right === "number") return left + right
      else if (typeof left === "string" && typeof right === "string") return left + right
      throw new RuntimeError(expr.operator, "Operands must be two numbers or two strings.")
    case TokenType.SLASH:
      checkNumberOperands(expr.operator, left, right)
      return left / right
    case TokenType.STAR:
      checkNumberOperands(expr.operator, left, right)
      return left * right
    case TokenType.BANG_EQUAL:
      return !isEqual(left, right)
    case TokenType.EQUAL_EQUAL:
      return isEqual(left, right)
  }
}

function isTruthy(object: any): boolean {
  if (object == null) return false
  if (typeof object == "boolean") return object
  return false
}

function isEqual(a: any, b: any): boolean {
  return a === b
}

function checkNumberOperand(token: Token, operand: any) {
  if (typeof operand === "number") return
  throw new RuntimeError(token, "Operand must be a number.")
}

function checkNumberOperands(token: Token, left: any, right: any) {
  if (typeof left === "number" && typeof right === "number") return
  throw new RuntimeError(token, "Operands must be a numbers.")
}

export class RuntimeError extends Error {
  token: Token
  constructor(token: Token, message: string) {
    super(message)
    this.token = token
  }
}
