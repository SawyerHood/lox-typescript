import {
  BlockStmt,
  Stmt,
  VarStmt,
  Expr,
  VariableExpr,
  AssignExpr,
  FunctionStmt,
  ClassStmt,
  IfStmt,
  ReturnStmt,
  WhileStmt,
  SetExpr,
  LogicalExpr,
  BinaryExpr,
  CallExpr,
  ThisExpr,
  SuperExpr,
} from "./Ast"
import Token from "./Token"
import { tokenError } from "./Error"
import { exhaustiveCheck } from "./exhaustiveCheck"
import { Interpreter } from "./Interpreter"

type FunctionType = "none" | "function" | "method" | "initializer"
type ClassType = "none" | "class" | "subclass"

export class Resolver {
  private scopes: Map<string, boolean>[] = []
  private currentFunction: FunctionType = "none"
  private currentClass: ClassType = "none"
  private interpreter: Interpreter

  constructor(interpreter: Interpreter) {
    this.interpreter = interpreter
  }

  resolveStatements(statements: Array<Stmt>) {
    for (const statement of statements) {
      this.resolveStatement(statement)
    }
  }

  private resolveStatement(stmt: Stmt) {
    switch (stmt.type) {
      case "BlockStmt": {
        this.resolveBlockStmt(stmt)
        break
      }
      case "VarStmt": {
        this.resolveVarStmt(stmt)
        break
      }
      case "ExpressionStmt": {
        this.resolveExpr(stmt.expression)
        break
      }
      case "FunctionStmt": {
        this.resolveFunctionStmt(stmt)
        break
      }
      case "IfStmt": {
        this.resolveIfStmt(stmt)
        break
      }
      case "PrintStmt": {
        this.resolveExpr(stmt.expression)
        break
      }
      case "ReturnStmt": {
        this.resolveReturnStmt
        break
      }
      case "WhileStmt": {
        this.resolveWhileStmt(stmt)
        break
      }
      case "ClassStmt": {
        this.resolveClassStmt(stmt)
        break
      }
      default:
        exhaustiveCheck(stmt)
    }
  }
  private resolveExpr(expr: Expr) {
    switch (expr.type) {
      case "VariableExpr":
        this.resolveVariableExpr(expr)
        break
      case "AssignExpr":
        this.resolveAssignExpr(expr)
        break
      case "BinaryExpr":
        this.resolveBinaryExpr(expr)
        break
      case "CallExpr":
        this.resolveCallExpr(expr)
        break
      case "GroupingExpr":
        this.resolveExpr(expr.expression)
        break
      case "LiteralExpr":
        break
      case "LogicalExpr":
        this.resolveLogicalExpr(expr)
        break
      case "UnaryExpr":
        this.resolveExpr(expr.right)
        break
      case "GetExpr":
        this.resolveExpr(expr.object)
        break
      case "SetExpr":
        this.resolveSetExpr(expr)
        break
      case "ThisExpr":
        this.resolveThisExpr(expr)
        break
      case "SuperExpr":
        this.resolveSuperExpr(expr)
        break
      default:
        exhaustiveCheck(expr)
    }
  }

  private resolveSuperExpr(expr: SuperExpr) {
    if (this.currentClass == "none") {
      tokenError(expr.keyword, "Cannot use 'super' outside of a class.")
    } else if (this.currentClass !== "subclass") {
      tokenError(expr.keyword, "Cannot use 'super' in a class with no superclass.")
    }
    this.resolveLocal(expr, expr.keyword)
  }

  private resolveThisExpr(expr: ThisExpr) {
    if (this.currentClass === "none") {
      tokenError(expr.keyword, "Cannot use 'this' outside of a class.")
    }

    this.resolveLocal(expr, expr.keyword)
  }

  private resolveSetExpr(expr: SetExpr) {
    this.resolveExpr(expr.value)
    this.resolveExpr(expr.object)
  }

  private resolveLogicalExpr(expr: LogicalExpr) {
    this.resolveExpr(expr.left)
    this.resolveExpr(expr.right)
  }

  private resolveCallExpr(expr: CallExpr) {
    this.resolveExpr(expr.callee)
    for (const arg of expr.arguments) {
      this.resolveExpr(arg)
    }
  }

  private resolveBinaryExpr(expr: BinaryExpr) {
    this.resolveExpr(expr.left)
    this.resolveExpr(expr.right)
  }

  private resolveWhileStmt(stmt: WhileStmt) {
    this.resolveExpr(stmt.condition)
    this.resolveStatement(stmt.body)
  }

  private resolveReturnStmt(stmt: ReturnStmt) {
    if (this.currentFunction === "none") {
      tokenError(stmt.keyword, "Cannot return from top-level code.")
    }

    if (stmt.value) {
      if (this.currentFunction === "initializer") {
        tokenError(stmt.keyword, "Cannot return a value from an initializer.")
      }
      this.resolveExpr(stmt.value)
    }
  }

  private resolveIfStmt(stmt: IfStmt) {
    this.resolveExpr(stmt.condition)
    this.resolveStatement(stmt.thenBranch)
    if (stmt.elseBranch) this.resolveStatement(stmt.elseBranch)
  }

  private resolveClassStmt(stmt: ClassStmt) {
    const enclosingClass = this.currentClass
    this.currentClass = "class"

    this.declare(stmt.name)
    this.define(stmt.name)

    if (stmt.superclass) {
      if (stmt.name.lexeme === stmt.superclass.name.lexeme) {
        tokenError(stmt.superclass.name, "A class cannot inherit from itself.")
      }
      this.currentClass = "subclass"
      this.resolveExpr(stmt.superclass)
    }

    if (stmt.superclass) {
      this.beginScope()
      this.peekScopes().set("SuperExpr", true)
    }

    this.beginScope()
    this.peekScopes().set("ThisExpr", true)

    for (const method of stmt.methods) {
      const declaration = method.name.lexeme === "init" ? "initializer" : "method"
      this.resolveFunction(method, declaration)
    }

    this.endScope()
    if (stmt.superclass) this.endScope()

    this.currentClass = enclosingClass
  }

  private resolveVarStmt(stmt: VarStmt) {
    this.declare(stmt.name)
    if (stmt.initializer !== null) {
      this.resolveExpr(stmt.initializer)
    }
    this.define(stmt.name)
  }

  private resolveBlockStmt(stmt: BlockStmt) {
    this.beginScope()
    this.resolveStatements(stmt.statements)
    this.endScope()
  }

  private resolveFunctionStmt(stmt: FunctionStmt) {
    this.declare(stmt.name)
    this.define(stmt.name)

    this.resolveFunction(stmt, "function")
  }

  private resolveFunction(fn: FunctionStmt, functionType: FunctionType) {
    const enclosingFunction = this.currentFunction
    this.currentFunction = functionType

    this.beginScope()
    for (const param of fn.params) {
      this.declare(param)
      this.define(param)
    }
    this.resolveStatements(fn.body)
    this.endScope()
    this.currentFunction = enclosingFunction
  }

  private resolveVariableExpr(expr: VariableExpr) {
    if (this.scopes.length && this.peekScopes().get(expr.name.lexeme) === false) {
      tokenError(expr.name, "Cannot read local variable in its own initializer.")
    }

    this.resolveLocal(expr, expr.name)
  }

  private resolveAssignExpr(expr: AssignExpr) {
    this.resolveExpr(expr.value)
    this.resolveLocal(expr, expr.name)
  }

  private resolveLocal(expr: Expr, name: Token) {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(name.lexeme)) {
        this.interpreter.resolve(expr, this.scopes.length - 1 - i)
      }
    }
  }

  private beginScope() {
    this.scopes.push(new Map())
  }

  private endScope() {
    this.scopes.pop()
  }

  private declare(name: Token) {
    if (this.scopes.length === 0) {
      return
    }

    const scope = this.peekScopes()

    if (scope.has(name.lexeme)) {
      tokenError(name, "VariableExpr with this name already declared in this scope.")
    }

    scope.set(name.lexeme, false)
  }

  private define(name: Token) {
    if (this.scopes.length === 0) {
      return
    }
    this.peekScopes().set(name.lexeme, true)
  }

  private peekScopes() {
    return this.scopes[this.scopes.length - 1]
  }
}
