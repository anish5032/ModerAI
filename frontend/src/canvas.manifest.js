export const manifest = {
    screens: {
        scr_8va1r5: { name: "Live monitoring", route: "/", state: { mode: "simulation", playing: true, currentTime: 85, manualOverride: false }, position: { x: 160, y: 220 } },
        scr_o813bs: { name: "Clear chunk", route: "/", state: { mode: "simulation", playing: false, currentTime: 5, manualOverride: false }, position: { x: 1560, y: 220 } },
        scr_4pm8iw: { name: "Flag for review", route: "/", state: { mode: "simulation", playing: false, currentTime: 23, manualOverride: false }, position: { x: 2960, y: 220 } },
        scr_ga5uug: { name: "Mute audio enforced", route: "/", state: { mode: "simulation", playing: false, currentTime: 81, manualOverride: false }, position: { x: 4360, y: 220 } },
        scr_1w9wvn: { name: "Manual override -- blur", route: "/", state: { mode: "simulation", playing: false, currentTime: 81, manualOverride: true, manualAction: "blur" }, position: { x: 5760, y: 220 } },
        scr_w290ex: { name: "Block / takedown", route: "/", state: { mode: "simulation", playing: false, currentTime: 85, manualOverride: false }, position: { x: 7160, y: 220 } },
        scr_e3lp3v: { name: "Upload custom video", route: "/", state: { mode: "upload", playing: false, currentTime: 0, manualOverride: false }, position: { x: 8560, y: 220 } }
    },
    sections: {
        sec_8c6vji: { name: "Content Moderation Workflow", x: 0, y: 0, width: 9920, height: 1180 }
    },
    layers: [
        { kind: "section", id: "sec_8c6vji", children: [
                { kind: "screen", id: "scr_8va1r5" },
                { kind: "screen", id: "scr_o813bs" },
                { kind: "screen", id: "scr_4pm8iw" },
                { kind: "screen", id: "scr_ga5uug" },
                { kind: "screen", id: "scr_1w9wvn" },
                { kind: "screen", id: "scr_w290ex" },
                { kind: "screen", id: "scr_e3lp3v" }
            ] }
    ]
};
