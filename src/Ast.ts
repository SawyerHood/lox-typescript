import Token from './Token'

export type Binary = {type: 'binary'; left: Expr; operator: Token; right: Expr}
export type Grouping = {type: 'grouping'; expression: Expr}
export type Literal = {type: 'literal'; value: any}
export type Unary = {type: 'unary'; operator: Token; right: Expr}

export type Expr = Binary | Grouping | Literal | Unary
