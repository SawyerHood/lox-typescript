import Token from "./Token"
import { RuntimeError } from "./Interpreter"

export default class Environment {
  values: { [name: string]: any } = {}
  enclosing: Environment | null = null

  constructor(enclosing?: Environment | null) {
    this.enclosing = enclosing ?? null
  }

  define(name: string, value: any) {
    this.values[name] = value
  }

  get(name: Token): any {
    if (this.values.hasOwnProperty(name.lexeme)) {
      return this.values[name.lexeme]
    }

    if (this.enclosing) return this.enclosing.get(name)

    throw new RuntimeError(name, `Undefined variable '${name.lexeme}'.`)
  }

  assign(name: Token, value: any) {
    if (this.values.hasOwnProperty(name.lexeme)) {
      this.values[name.lexeme] = value
      return
    }

    if (this.enclosing) {
      this.enclosing.assign(name, value)
      return
    }

    throw new RuntimeError(name, `Undefined variable '${name.lexeme}'.`)
  }
}
