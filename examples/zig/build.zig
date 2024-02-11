const std = @import("std");
const Builder = std.build.Builder;
const builtin = @import("builtin");

pub fn build(b: *Builder) void {
    const lib = b.addSharedLibrary(.{
        .name = "main",
        .root_source_file = .{ .path = "src/main.zig" },
        .target = .{ .cpu_arch = .wasm32, .os_tag = .freestanding },
        .optimize = .ReleaseSmall,
    });
    lib.rdynamic = true;

    // Setup custom build step to optimize binary and rename memory export.
    const strip = b.addSystemCommand(&[_][]const u8{"../strip.sh"});
    strip.addArtifactArg(lib);
    strip.step.dependOn(&lib.step);
    const install = b.addInstallArtifact(lib, .{});
    install.step.dependOn(&strip.step);
    b.default_step.dependOn(&install.step);
}
