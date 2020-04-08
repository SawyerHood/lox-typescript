import TokenType from './TokenType'

type Token = {
  type: TokenType,
  lexeme: string,
  literal: any | null,
  line: number
}

export default Token