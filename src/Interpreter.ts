import { Expr, Unary, Binary, Stmt, Logical, Call, FunctionStmt, Get, Set } from "./Ast"
import TokenType from "./TokenType"
import Token from "./Token"
import { runtimeError } from "./Error"
import Environment from "./Enviornment"
import { exhaustiveCheck } from "./exhaustiveCheck"

const globals = new Environment()
const locals: Map<Expr, number> = new Map()
let environment = globals

globals.define("clock", {
  arity() {
    return 0
  },

  call(args: any[]): number {
    return Date.now() / 1000
  },
})

export function resolve(expr: Expr, depth: number) {
  locals.set(expr, depth)
}

interface LoxCallable {
  call(args: any[]): any
  arity(): number
}

class LoxClass implements LoxCallable {
  private name: string
  private superclass: LoxClass | null = null
  private methods: { [key: string]: LoxFunction }

  constructor(name: string, superclass: LoxClass | null, methods: { [key: string]: LoxFunction }) {
    this.name = name
    this.superclass = superclass
    this.methods = methods
  }

  findMethod(name: string): LoxFunction | null {
    if (this.methods.hasOwnProperty(name)) {
      return this.methods[name]
    }

    if (this.superclass) {
      return this.superclass.findMethod(name)
    }

    return null
  }

  call(args: any[]) {
    const instance = new LoxInstance(this)

    const initializer = this.findMethod("init")
    if (initializer) {
      initializer.bind(instance).call(args)
    }

    return instance
  }

  arity() {
    return 0
  }
}

class LoxFunction implements LoxCallable {
  private declaration: FunctionStmt
  private closure: Environment
  private isInitializer = false

  constructor(declaration: FunctionStmt, closure: Environment, isInitializer: boolean) {
    this.declaration = declaration
    this.closure = closure
    this.isInitializer = isInitializer
  }

  call(args: any[]) {
    const env = new Environment(this.closure)
    for (let i = 0; i < this.declaration.params.length; i++) {
      env.define(this.declaration.params[i].lexeme, args[i])
    }
    try {
      evaluateBlock(this.declaration.body, env)
    } catch (ret) {
      if (ret instanceof Return) {
        if (this.isInitializer) return this.closure.getAt(0, "this")
        return ret.value
      } else {
        throw ret
      }
    }
    if (this.isInitializer) return this.closure.getAt(0, "this")
    return null
  }

  arity() {
    return this.declaration.params.length
  }

  bind(instance: LoxInstance): LoxFunction {
    const env = new Environment(this.closure)
    env.define("this", instance)
    return new LoxFunction(this.declaration, env, this.isInitializer)
  }
}

class LoxInstance {
  private klass: LoxClass
  private fields: { [key: string]: any } = {}

  constructor(klass: LoxClass) {
    this.klass = klass
  }

  get(name: Token) {
    if (this.fields.hasOwnProperty(name.lexeme)) {
      return this.fields[name.lexeme]
    }

    const method = this.klass.findMethod(name.lexeme)
    if (method) return method.bind(this)

    throw new RuntimeError(name, `Undefined property '${name.lexeme}'.`)
  }

  set(name: Token, value: any) {
    this.fields[name.lexeme] = value
  }
}

export default function interpret(statements: Stmt[]) {
  try {
    for (const stmt of statements) {
      evaluateStmt(stmt)
    }
  } catch (e) {
    if (e instanceof RuntimeError) {
      runtimeError(e)
    } else {
      throw e
    }
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
      return
    }
    case "if statement": {
      if (isTruthy(evaluate(stmt.condition))) {
        evaluateStmt(stmt.thenBranch)
      } else if (stmt.elseBranch) {
        evaluateStmt(stmt.elseBranch)
      }
      return
    }
    case "while statement": {
      while (isTruthy(evaluate(stmt.condition))) {
        evaluateStmt(stmt.body)
      }
      return
    }
    case "function statement": {
      const fun = new LoxFunction(stmt, environment, false)
      environment.define(stmt.name.lexeme, fun)
      return
    }
    case "return statement": {
      let value = null
      if (stmt.value) value = evaluate(stmt.value)
      throw new Return(value)
    }
    case "class statement": {
      let superclass = null

      if (stmt.superclass) {
        superclass = evaluate(stmt.superclass)
        if (!(superclass instanceof LoxClass)) {
          throw new RuntimeError(stmt.superclass.name, "Superclass must be a class")
        }
      }

      environment.define(stmt.name.lexeme, null)

      if (stmt.superclass) {
        environment = new Environment(environment)
        environment.define("super", superclass)
      }

      const methods: { [key: string]: LoxFunction } = {}
      for (const method of stmt.methods) {
        const fun = new LoxFunction(method, environment, method.name.lexeme === "init")
        methods[method.name.lexeme] = fun
      }

      const klass = new LoxClass(stmt.name.lexeme, superclass, methods)

      if (stmt.superclass) {
        environment = environment.enclosing!
      }

      environment.assign(stmt.name, klass)
      break
    }
    default:
      exhaustiveCheck(stmt)
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
    case "logical":
      return evaluateLogical(expr)
    case "grouping":
      return evaluate(expr.expression)
    case "unary":
      return evaluateUnary(expr)
    case "binary":
      return evaluateBinary(expr)
    case "variable":
      return lookUpVariable(expr.name, expr)
    case "assign": {
      const value = evaluate(expr.value)
      const distance = locals.get(expr)
      if (distance != null) {
        environment.assignAt(distance, expr.name, value)
      } else {
        globals.assign(expr.name, value)
      }
      return value
    }
    case "call":
      return evaluateCall(expr)
    case "get":
      return evaluateGet(expr)
    case "set":
      return evaluateSet(expr)
    case "this":
      return lookUpVariable(expr.keyword, expr)
    case "super":
      const distance = locals.get(expr) ?? 1
      const superclass: LoxClass = environment.getAt(distance, "super")

      const object: LoxInstance = environment.getAt(distance - 1, "this")
      const method = superclass.findMethod(expr.method.lexeme)

      if (!method) {
        throw new RuntimeError(expr.method, `Indefined property '${expr.method.lexeme}'.`)
      }

      return method.bind(object)
    default:
      exhaustiveCheck(expr)
  }
}

function evaluateSet(expr: Set): any {
  const object = evaluate(expr.object)

  if (!(object instanceof LoxInstance)) {
    throw new RuntimeError(expr.name, "Only instances have fields.")
  }

  const value = evaluate(expr.value)
  object.set(expr.name, value)
  return value
}

function evaluateGet(expr: Get): any {
  const obj = evaluate(expr.object)
  if (obj instanceof LoxInstance) {
    return obj.get(expr.name)
  }

  throw new RuntimeError(expr.name, "Only instances have properties.")
}

function lookUpVariable(name: Token, expr: Expr): any {
  const distance = locals.get(expr)
  if (distance != null) {
    return environment.getAt(distance, name.lexeme)
  } else {
    return globals.get(name)
  }
}

function evaluateCall(expr: Call): any {
  const callee = evaluate(expr.callee)
  const args = expr.arguments.map((arg) => evaluate(arg))

  if (!callee.call || !callee.arity) {
    throw new RuntimeError(expr.paren, "Can only call functions and classes")
  }

  if (args.length !== callee.arity()) {
    throw new RuntimeError(
      expr.paren,
      `Expected ${callee.arity()} arguments but got ${args.length}.`
    )
  }

  return callee.call(args)
}

function evaluateLogical(expr: Logical): any {
  const left = evaluate(expr.left)
  if (expr.operator.type == TokenType.OR) {
    if (isTruthy(left)) return left
  } else {
    if (!isTruthy(left)) return left
  }

  return evaluate(expr.right)
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
  return true
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

class Return {
  value: any = null
  constructor(value: any) {
    this.value = value
  }
}
