(module
    (func (export "process") (param f32) (result f32)
        (f32.div
            (f32.add
                (call $sintau (local.get 0))
                (call $sintau (f32.mul (local.get 0) (f32.const 1.5))))
            (f32.const 2)))

    ;; Math functions from https://gist.github.com/going-digital/02e46c44d89237c07bc99cd440ebfa43
    (func $sintau
        (param $x f32)
        (result f32)
        (local $x1 f32)
        (local $half f32)
        (f32.copysign
            (call $evalpoly
                ;; Reduce to 0..0.25 by folding about 0.25
                (f32.min
                    (f32.sub
                        (local.tee $half (f32.const 0.5))
                        ;; Reduce to 0..0.5 by folding about 0.5
                        (local.tee $x1 (f32.abs (f32.sub
                            ;; Reduce $x1 to range 0..1
                            (local.tee $x
                                (f32.sub (local.get $x) (f32.floor (local.get $x))))
                            (local.get $half)))))
                    (local.get $x1))
                (i32.const 0) (i32.const 24))
            ;; Sign of result
            (f32.sub
                (local.get $half)
                (local.get $x))))

    (func $evalpoly (param $x f32) (param $start i32) (param $end i32) (result f32)
        (local $result f32)
        (loop $loop
            (local.set $result
                (f32.add
                    (f32.mul (local.get $result) (local.get $x))
                    (f32.load (local.get $start))))
            (br_if $loop
                    (i32.sub
                        (local.tee $start
                            (i32.add (local.get $start) (i32.const 4)))
                        (local.get $end))))
        (local.get $result))

    (memory 68 68)
    (data (i32.const 0)
        ;; sintau polynomial coefficients
        "\3f\c7\61\42" "\d9\e0\13\41" "\4b\aa\2a\c2" "\73\b2\a6\3d" "\40\01\c9\40" "\7e\95\d0\36"))
