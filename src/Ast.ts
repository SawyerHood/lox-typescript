import Token from './Token'

export type Binary = {type: 'binary'; left: Expr; operator: Token; right: Expr}
export type Grouping = {type: 'grouping'; expression: Expr}
export type Literal = {type: 'literal'; value: any}
export type Unary = {type: 'unary'; operator: Token; right: Expr}

export type Expr = Binary | Grouping | Literal | Unary

export type ExpressionStmt = {type: 'expression statement', expression: Expr}
export type PrintStmt = {type: 'print statement', expression: Expr}
export type Stmt = ExpressionStmt | PrintStmt
