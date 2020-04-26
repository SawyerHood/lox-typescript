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

  getAt(distance: number, name: string) {
    return this.ancestor(distance).values[name]
  }

  ancestor(distance: number): Environment {
    let env: Environment = this as Environment
    for (let i = 0; i < distance; i++) {
      env = env!.enclosing!
    }
    return env
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

  assignAt(distance: number, name: Token, value: any) {
    this.ancestor(distance).values[name.lexeme] = value
  }
}
