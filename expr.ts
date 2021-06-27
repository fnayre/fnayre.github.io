type Program<A> =
  | { tag: "pure"; value: A }
  | {
      tag: "operation"
      name: string
      params: Array<any>
      resume: (x: any) => Program<A>
    }

function pure<A>(value: A): Program<A> {
  return { tag: "pure", value }
}

const id = <X>(x: X) => x

function operation<A>(
  name: string,
  params: any[] = [],
  resume: (x: any) => Program<A> = pure
): Program<A> {
  return { tag: "operation", name, params, resume: resume }
}

const random = operation<number>("random")

function log(message: string): Program<undefined> {
  return operation("log", [message])
}

function bind<A, B>(
  program: Program<A>,
  then: (a: A) => Program<B>
): Program<B> {
  if (program.tag === "pure") return then(program.value)
  else {
    let { name, params, resume } = program
    return operation(name, params, a => bind(resume(a), then))
  }
}

function handler(model: any) {
  return function evaluate<A, B>(program: Program<A>): Program<B> {
    if (program.tag === "pure")
      return model.return ? model.return(program.value) : program.value
    else {
      let { name, params, resume } = program
      if (name in model) {
        return model[name](...params.concat(a => evaluate(resume(a))))
      } else {
        return operation(name, params, a => evaluate(resume(a)))
      }
    }
  }
}
