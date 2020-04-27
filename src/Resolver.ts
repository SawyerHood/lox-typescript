import {
  BlockStmt,
  Stmt,
  VarStmt,
  Expr,
  Variable,
  Assign,
  FunctionStmt,
  ClassStmt,
  IfStmt,
  ReturnStmt,
  WhileStmt,
  Set,
  Logical,
  Binary,
  Call,
  This,
  Super,
} from "./Ast"
import Token from "./Token"
import { tokenError } from "./Error"
import { exhaustiveCheck } from "./exhaustiveCheck"
import { resolve } from "./Interpreter"

type FunctionType = "none" | "function" | "method" | "initializer"
type ClassType = "none" | "class" | "subclass"

export class Resolver {
  private scopes: Map<string, boolean>[] = []
  private currentFunction: FunctionType = "none"
  private currentClass: ClassType = "none"

  resolveStatements(statements: Array<Stmt>) {
    for (const statement of statements) {
      this.resolveStatement(statement)
    }
  }

  private resolveStatement(stmt: Stmt) {
    switch (stmt.type) {
      case "block statement": {
        this.resolveBlockStmt(stmt)
        break
      }
      case "var statement": {
        this.resolveVarStmt(stmt)
        break
      }
      case "expression statement": {
        this.resolveExpr(stmt.expression)
        break
      }
      case "function statement": {
        this.resolveFunctionStmt(stmt)
        break
      }
      case "if statement": {
        this.resolveIfStmt(stmt)
        break
      }
      case "print statement": {
        this.resolveExpr(stmt.expression)
        break
      }
      case "return statement": {
        this.resolveReturnStmt
        break
      }
      case "while statement": {
        this.resolveWhileStmt(stmt)
        break
      }
      case "class statement": {
        this.resolveClassStmt(stmt)
        break
      }
      default:
        exhaustiveCheck(stmt)
    }
  }
  private resolveExpr(expr: Expr) {
    switch (expr.type) {
      case "variable":
        this.resolveVariableExpr(expr)
        break
      case "assign":
        this.resolveAssignExpr(expr)
        break
      case "binary":
        this.resolveBinaryExpr(expr)
        break
      case "call":
        this.resolveCallExpr(expr)
        break
      case "grouping":
        this.resolveExpr(expr.expression)
        break
      case "literal":
        break
      case "logical":
        this.resolveLogicalExpr(expr)
        break
      case "unary":
        this.resolveExpr(expr.right)
        break
      case "get":
        this.resolveExpr(expr.object)
        break
      case "set":
        this.resolveSetExpr(expr)
        break
      case "this":
        this.resolveThisExpr(expr)
        break
      case "super":
        this.resolveSuperExpr(expr)
        break
      default:
        exhaustiveCheck(expr)
    }
  }

  private resolveSuperExpr(expr: Super) {
    if (this.currentClass == "none") {
      tokenError(expr.keyword, "Cannot use 'super' outside of a class.")
    } else if (this.currentClass !== "subclass") {
      tokenError(expr.keyword, "Cannot use 'super' in a class with no superclass.")
    }
    this.resolveLocal(expr, expr.keyword)
  }

  private resolveThisExpr(expr: This) {
    if (this.currentClass === "none") {
      tokenError(expr.keyword, "Cannot use 'this' outside of a class.")
    }

    this.resolveLocal(expr, expr.keyword)
  }

  private resolveSetExpr(expr: Set) {
    this.resolveExpr(expr.value)
    this.resolveExpr(expr.object)
  }

  private resolveLogicalExpr(expr: Logical) {
    this.resolveExpr(expr.left)
    this.resolveExpr(expr.right)
  }

  private resolveCallExpr(expr: Call) {
    this.resolveExpr(expr.callee)
    for (const arg of expr.arguments) {
      this.resolveExpr(arg)
    }
  }

  private resolveBinaryExpr(expr: Binary) {
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
      this.peekScopes().set("super", true)
    }

    this.beginScope()
    this.peekScopes().set("this", true)

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

  private resolveVariableExpr(expr: Variable) {
    if (this.scopes.length && this.peekScopes().get(expr.name.lexeme) === false) {
      tokenError(expr.name, "Cannot read local variable in its own initializer.")
    }

    this.resolveLocal(expr, expr.name)
  }

  private resolveAssignExpr(expr: Assign) {
    this.resolveExpr(expr.value)
    this.resolveLocal(expr, expr.name)
  }

  private resolveLocal(expr: Expr, name: Token) {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(name.lexeme)) {
        resolve(expr, this.scopes.length - 1 - i)
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
      tokenError(name, "Variable with this name already declared in this scope.")
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
