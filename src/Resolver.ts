import { BlockStmt, Stmt, VarStmt, Expr, Variable, Assign, FunctionStmt } from "./Ast"
import Token from "./Token"
import { tokenError } from "./Error"
import { exhaustiveCheck } from "./exhaustiveCheck"
import { resolve } from "./Interpreter"

type FunctionType = "none" | "function" | "method" | "initializer"
type ClassType = "none" | "class" | "subclass"

export class Resolver {
  private scopes: Map<string, boolean>[] = []
  private currentFunction: FunctionType = "none"
  private currentClass = "none"

  resolveStatements(statements: Array<Stmt>) {
    for (const statement of statements) {
      this.resolveStatement(statement)
    }
  }

  private resolveStatement(stmt: Stmt) {
    switch (stmt.type) {
      case "block statement": {
        this.visitBlockStmt(stmt)
        break
      }
      case "var statement": {
        this.visitVarStmt(stmt)
        break
      }
      case "expression statement": {
        this.resolveExpr(stmt.expression)
        break
      }
      case "function statement": {
        this.visitFunctionStmt(stmt)
        break
      }
      case "if statement": {
        this.resolveExpr(stmt.condition)
        this.resolveStatement(stmt.thenBranch)
        if (stmt.elseBranch) this.resolveStatement(stmt.elseBranch)
        break
      }
      case "print statement": {
        this.resolveExpr(stmt.expression)
        break
      }
      case "return statement": {
        if (this.currentFunction === "none") {
          tokenError(stmt.keyword, "Cannot return from top-level code.")
        }

        if (stmt.value) {
          if (this.currentFunction === "initializer") {
            tokenError(stmt.keyword, "Cannot return a value from an initializer.")
          }
          this.resolveExpr(stmt.value)
        }
        break
      }
      case "while statement": {
        this.resolveExpr(stmt.condition)
        this.resolveStatement(stmt.body)
        break
      }
      case "class statement": {
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
          this.scopes[this.scopes.length - 1].set("super", true)
        }

        this.beginScope()
        this.scopes[this.scopes.length - 1].set("this", true)

        for (const method of stmt.methods) {
          const declaration = method.name.lexeme === "init" ? "initializer" : "method"
          this.resolveFunction(method, declaration)
        }

        this.endScope()
        if (stmt.superclass) this.endScope()

        this.currentClass = enclosingClass

        break
      }
      default:
        exhaustiveCheck(stmt)
    }
  }

  private visitVarStmt(stmt: VarStmt) {
    this.declare(stmt.name)
    if (stmt.initializer !== null) {
      this.resolveExpr(stmt.initializer)
    }
    this.define(stmt.name)
  }

  private visitBlockStmt(stmt: BlockStmt) {
    this.beginScope()
    this.resolveStatements(stmt.statements)
    this.endScope()
  }

  private visitFunctionStmt(stmt: FunctionStmt) {
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

  private resolveExpr(expr: Expr) {
    switch (expr.type) {
      case "variable": {
        this.visitVariableExpr(expr)
        break
      }
      case "assign": {
        this.visitAssignExpr(expr)
        break
      }
      case "binary": {
        this.resolveExpr(expr.left)
        this.resolveExpr(expr.right)
        break
      }
      case "call": {
        this.resolveExpr(expr.callee)

        for (const arg of expr.arguments) {
          this.resolveExpr(arg)
        }
        break
      }
      case "grouping": {
        this.resolveExpr(expr.expression)
        break
      }
      case "literal": {
        break
      }
      case "logical": {
        this.resolveExpr(expr.left)
        this.resolveExpr(expr.right)
        break
      }
      case "unary": {
        this.resolveExpr(expr.right)
        break
      }
      case "get": {
        this.resolveExpr(expr.object)
        break
      }
      case "set": {
        this.resolveExpr(expr.value)
        this.resolveExpr(expr.object)
        break
      }
      case "this": {
        if (this.currentClass === "none") {
          tokenError(expr.keyword, "Cannot use 'this' outside of a class.")
          break
        }

        this.resolveLocal(expr, expr.keyword)
        break
      }
      case "super": {
        if (this.currentClass == "none") {
          tokenError(expr.keyword, "Cannot use 'super' outside of a class.")
        } else if (this.currentClass !== "subclass") {
          tokenError(expr.keyword, "Cannot use 'super' in a class with no superclass.")
        }
        this.resolveLocal(expr, expr.keyword)
        break
      }
      default:
        exhaustiveCheck(expr)
    }
  }

  private visitVariableExpr(expr: Variable) {
    if (this.scopes.length && this.scopes[this.scopes.length - 1].get(expr.name.lexeme) === false) {
      tokenError(expr.name, "Cannot read local variable in its own initializer.")
    }

    this.resolveLocal(expr, expr.name)
  }

  private visitAssignExpr(expr: Assign) {
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

    const scope = this.scopes[this.scopes.length - 1]

    if (scope.has(name.lexeme)) {
      tokenError(name, "Variable with this name already declared in this scope.")
    }

    scope.set(name.lexeme, false)
  }

  private define(name: Token) {
    if (this.scopes.length === 0) {
      return
    }
    this.scopes[this.scopes.length - 1].set(name.lexeme, true)
  }
}
