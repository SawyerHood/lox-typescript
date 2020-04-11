import Token from "./Token"

export type Binary = { type: "binary"; left: Expr; operator: Token; right: Expr }
export type Grouping = { type: "grouping"; expression: Expr }
export type Literal = { type: "literal"; value: any }
export type Unary = { type: "unary"; operator: Token; right: Expr }
export type Variable = { type: "variable"; name: Token }
export type Assign = { type: "assign"; name: Token; value: any }

export type Expr = Binary | Grouping | Literal | Unary | Variable | Assign

export type ExpressionStmt = { type: "expression statement"; expression: Expr }
export type PrintStmt = { type: "print statement"; expression: Expr }
export type VarStmt = { type: "var statement"; name: Token; initializer: Expr | null }
export type BlockStmt = { type: "block statement"; statements: Stmt[] }
export type Stmt = ExpressionStmt | PrintStmt | VarStmt | BlockStmt
