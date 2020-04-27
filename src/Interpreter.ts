import {
  Expr,
  UnaryExpr,
  BinaryExpr,
  Stmt,
  LogicalExpr,
  CallExpr,
  FunctionStmt,
  GetExpr,
  SetExpr,
} from "./Ast"
import TokenType from "./TokenType"
import Token from "./Token"
import { runtimeError } from "./Error"
import Environment from "./Enviornment"
import { exhaustiveCheck } from "./exhaustiveCheck"

export class Interpreter {
  private globals = new Environment()
  private locals: Map<Expr, number> = new Map()
  private environment = this.globals

  constructor() {
    this.globals.define("clock", {
      arity() {
        return 0
      },

      call(args: any[]): number {
        return Date.now() / 1000
      },
    })
  }

  interpret(statements: Stmt[]) {
    try {
      for (const stmt of statements) {
        this.evaluateStmt(stmt)
      }
    } catch (e) {
      if (e instanceof RuntimeError) {
        runtimeError(e)
      } else {
        throw e
      }
    }
  }

  resolve(expr: Expr, depth: number) {
    this.locals.set(expr, depth)
  }

  evaluateStmt(stmt: Stmt): void {
    switch (stmt.type) {
      case "ExpressionStmt": {
        this.evaluate(stmt.expression)
        return
      }
      case "PrintStmt": {
        const val = this.evaluate(stmt.expression)
        console.log(val ?? "nil")
        return
      }
      case "VarStmt": {
        const val = stmt.initializer ? this.evaluate(stmt.initializer) : null

        this.environment.define(stmt.name.lexeme, val)
        return
      }
      case "BlockStmt": {
        this.evaluateBlock(stmt.statements, new Environment(this.environment))
        return
      }
      case "IfStmt": {
        if (isTruthy(this.evaluate(stmt.condition))) {
          this.evaluateStmt(stmt.thenBranch)
        } else if (stmt.elseBranch) {
          this.evaluateStmt(stmt.elseBranch)
        }
        return
      }
      case "WhileStmt": {
        while (isTruthy(this.evaluate(stmt.condition))) {
          this.evaluateStmt(stmt.body)
        }
        return
      }
      case "FunctionStmt": {
        const fun = new LoxFunction(this, stmt, this.environment, false)
        this.environment.define(stmt.name.lexeme, fun)
        return
      }
      case "ReturnStmt": {
        let value = null
        if (stmt.value) value = this.evaluate(stmt.value)
        throw new Return(value)
      }
      case "ClassStmt": {
        let superclass = null

        if (stmt.superclass) {
          superclass = this.evaluate(stmt.superclass)
          if (!(superclass instanceof LoxClass)) {
            throw new RuntimeError(stmt.superclass.name, "Superclass must be a class")
          }
        }

        this.environment.define(stmt.name.lexeme, null)

        if (stmt.superclass) {
          this.environment = new Environment(this.environment)
          this.environment.define("SuperExpr", superclass)
        }

        const methods: { [key: string]: LoxFunction } = {}
        for (const method of stmt.methods) {
          const fun = new LoxFunction(this, method, this.environment, method.name.lexeme === "init")
          methods[method.name.lexeme] = fun
        }

        const klass = new LoxClass(stmt.name.lexeme, superclass, methods)

        if (stmt.superclass) {
          this.environment = this.environment.enclosing!
        }

        this.environment.assign(stmt.name, klass)
        break
      }
      default:
        exhaustiveCheck(stmt)
    }
  }

  evaluateBlock(statements: Stmt[], env: Environment) {
    const previous = this.environment
    try {
      this.environment = env
      for (const statement of statements) {
        this.evaluateStmt(statement)
      }
    } finally {
      this.environment = previous
    }
  }

  evaluate(expr: Expr): any {
    switch (expr.type) {
      case "LiteralExpr":
        return expr.value
      case "LogicalExpr":
        return this.evaluateLogical(expr)
      case "GroupingExpr":
        return this.evaluate(expr.expression)
      case "UnaryExpr":
        return this.evaluateUnary(expr)
      case "BinaryExpr":
        return this.evaluateBinary(expr)
      case "VariableExpr":
        return this.lookUpVariable(expr.name, expr)
      case "AssignExpr": {
        const value = this.evaluate(expr.value)
        const distance = this.locals.get(expr)
        if (distance != null) {
          this.environment.assignAt(distance, expr.name, value)
        } else {
          this.globals.assign(expr.name, value)
        }
        return value
      }
      case "CallExpr":
        return this.evaluateCall(expr)
      case "GetExpr":
        return this.evaluateGet(expr)
      case "SetExpr":
        return this.evaluateSet(expr)
      case "ThisExpr":
        return this.lookUpVariable(expr.keyword, expr)
      case "SuperExpr":
        const distance = this.locals.get(expr) ?? 1
        const superclass: LoxClass = this.environment.getAt(distance, "SuperExpr")

        const object: LoxInstance = this.environment.getAt(distance - 1, "ThisExpr")
        const method = superclass.findMethod(expr.method.lexeme)

        if (!method) {
          throw new RuntimeError(expr.method, `Indefined property '${expr.method.lexeme}'.`)
        }

        return method.bind(object)
      default:
        exhaustiveCheck(expr)
    }
  }

  evaluateSet(expr: SetExpr): any {
    const object = this.evaluate(expr.object)

    if (!(object instanceof LoxInstance)) {
      throw new RuntimeError(expr.name, "Only instances have fields.")
    }

    const value = this.evaluate(expr.value)
    object.set(expr.name, value)
    return value
  }

  evaluateGet(expr: GetExpr): any {
    const obj = this.evaluate(expr.object)
    if (obj instanceof LoxInstance) {
      return obj.get(expr.name)
    }

    throw new RuntimeError(expr.name, "Only instances have properties.")
  }

  lookUpVariable(name: Token, expr: Expr): any {
    const distance = this.locals.get(expr)
    if (distance != null) {
      return this.environment.getAt(distance, name.lexeme)
    } else {
      return this.globals.get(name)
    }
  }

  evaluateCall(expr: CallExpr): any {
    const callee = this.evaluate(expr.callee)
    const args = expr.arguments.map((arg) => this.evaluate(arg))

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

  evaluateLogical(expr: LogicalExpr): any {
    const left = this.evaluate(expr.left)
    if (expr.operator.type == TokenType.OR) {
      if (isTruthy(left)) return left
    } else {
      if (!isTruthy(left)) return left
    }

    return this.evaluate(expr.right)
  }

  evaluateUnary(expr: UnaryExpr): any {
    const right = this.evaluate(expr.right)

    switch (expr.operator.type) {
      case TokenType.BANG:
        return !isTruthy(right)
      case TokenType.MINUS:
        checkNumberOperand(expr.operator, right)
        return -right
    }
  }

  evaluateBinary(expr: BinaryExpr): any {
    const left = this.evaluate(expr.left)
    const right = this.evaluate(expr.right)

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
  private interpreter: Interpreter
  private declaration: FunctionStmt
  private closure: Environment
  private isInitializer = false

  constructor(
    interpreter: Interpreter,
    declaration: FunctionStmt,
    closure: Environment,
    isInitializer: boolean
  ) {
    this.interpreter = interpreter
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
      this.interpreter.evaluateBlock(this.declaration.body, env)
    } catch (ret) {
      if (ret instanceof Return) {
        if (this.isInitializer) return this.closure.getAt(0, "ThisExpr")
        return ret.value
      } else {
        throw ret
      }
    }
    if (this.isInitializer) return this.closure.getAt(0, "ThisExpr")
    return null
  }

  arity() {
    return this.declaration.params.length
  }

  bind(instance: LoxInstance): LoxFunction {
    const env = new Environment(this.closure)
    env.define("ThisExpr", instance)
    return new LoxFunction(this.interpreter, this.declaration, env, this.isInitializer)
  }
}

export class LoxInstance {
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
