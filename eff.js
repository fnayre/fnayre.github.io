const id = x => x

function operation(name, params = [], resume = id) {
  return { _IS_OPERATION_: true, name, params, resume }
}

function bind(program, then) {
  if (!program?._IS_OPERATION_) {
    return then(program)
  } else {
    let { name, params, resume } = program
    return operation(name, params, a => bind(resume(a), then))
  }
}

function all(computations) {
  if (computations.length === 0) return []
  let [c, ...rest] = computations
  return bind(c, x => bind(all(rest), xs => [x, ...xs]))
}

function ap(cfunc, ...cargs) {
  return bind(cfunc, func => bind(all(cargs), args => func(...args)))
}

function seq(...computations) {
  return bind(all(computations), xs => xs[xs.length - 1])
}

function handler(model) {
  return function evaluate(tree) {
    if (!tree?._IS_OPERATION_) return model.return ? model.return(tree) : tree
    let { name, params, resume } = tree
    if (name in model) {
      return go(
        model[name],
        params.concat(x => handle(resume(x), model))
      )
    }
    return operation(name, params, x => handle(resume(x), model))
  }
}

const handler = _handler => computation => handle(computation, _handler)

function go(gf, args = [], history = []) {
  let gen = gf(...args)
  let res = history.reduce((_, x) => gen.next(x), gen.next())
  if (res.done) return res.value
  else {
    return bind(res.value, x => go(gf, args, history.concat(x)))
  }
}

const print = x => operation("print", [x])
const asynk = start => operation("asynk", [start])

let run = handler({
  print(x, resume) {
    console.info(x)
    resume()
  },
  asynk(start, resume) {
    return start(resume)
  },
})

const read = operation("read")

function wait(ms) {
  return asynk(k => {
    setTimeout(() => {
      k()
    }, ms)
  })
}

function exit() {
  return asynk(() => {})
}

function fork() {
  return asynk(k => {
    setTimeout(() => k(true), 0)
    k(false)
  })
}

let NA = {}

function par(c1, c2) {
  let r1 = NA
  let r2 = NA
  return bind(fork(), b => {
    if (b) {
      return bind(c2, x => {
        r2 = x
        return r1 === NA ? exit() : [r1, r2]
      })
    } else {
      return bind(c1, x => {
        r1 = x
        return r2 === NA ? exit() : [r1, r2]
      })
    }
  })
}

let abc = go(function* () {
  yield print("A")
  yield print("B")
  yield print("C")
})

let hprintRev = handler({
  print(x, resume) {
    return bind(resume(), () => print(x))
  },
})

let hprintCollect = handler({
  return(x) {
    return [x, ""]
  },
  print(x, resume) {
    return bind(resume(), r => [r[0], x + r[1]])
  },
})

hprintCollect1 = handler({
  return: x => acc => [x, acc],
  print: (s, resume) => acc => resume()(s + acc),
})

let fail = operation("fail")
let decide = operation("decide")

function choose(m, n) {
  return bind(decide, b => (b ? m : n))
}

const pickMax = handler({
  *decide(resume) {
    let x = yield resume(true)
    let y = yield resume(false)
    return Math.max(x, y)
  },
})

const pf = go(function* () {
  let x = yield choose(15, 30)
  let y = yield choose(5, 10)
  return x - y
})

function chooseIn(m, n) {
  return m > n ? fail : choose(m, chooseIn(m + 1, n))
}

function isSquare(x) {
  let sqrt = Math.sqrt(x)
  return Math.floor(sqrt) === sqrt
}

function* pythagorean(m, n) {
  let a = yield chooseIn(m, n - 1)
  let b = yield chooseIn(a + 1, n)
  let cSquared = a * a + b * b
  if (isSquare(cSquared)) return [a, b, Math.sqrt(cSquared)]
  else yield fail
}

let backtrack = handler({
  decide(resume) {
    return handle(resume(false), {
      fail: () => resume(true),
    })
  },
})

let get = operation("get")
let put = s => operation("put", [s])

let state = handler({
  return: x => _ => x,
  get: resume => s => ap(resume(s), s),
  put: (s, resume) => _ => ap(resume(), s),
})

const ps = go(function* ps() {
  let x = yield get
  yield wait(3000)
  yield put(x + 10)
  let y = yield get
  yield print(y)
})
