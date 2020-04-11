import { Expr } from "./Ast"

export function visit(expr: Expr): string {
  switch (expr.type) {
    case "binary":
      return `(${expr.operator.lexeme} ${visit(expr.left)} ${visit(expr.right)})`
    case "grouping":
      return `(group ${visit(expr.expression)})`
    case "literal":
      return `(${String(expr.value)})`
    case "unary":
      return `(${expr.operator.lexeme} ${visit(expr.right)})`
  }
  return "Not Implemented"
}
