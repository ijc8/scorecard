const description = "zig example".*;

const std = @import("std");
const RndGen = std.rand.DefaultPrng;

var rnd: RndGen = .{ .s = undefined };

fn setup(seed: u32) callconv(.C) void {
    rnd.seed(seed);
}

fn process() callconv(.C) f32 {
    return rnd.random().float(f32) * 2 - 1;
}

comptime {
    @export(description, .{ .name = "d", .linkage = .Strong });
    @export(setup, .{ .name = "s", .linkage = .Strong });
    @export(process, .{ .name = "p", .linkage = .Strong });
}
