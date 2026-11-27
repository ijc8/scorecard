// Two triangles, drawn on pixelarticons' grid (which has no fast-forward icon of its own).
export const Forward = (props: React.SVGProps<SVGSVGElement>) => <svg fill="none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {...props}>
    <path d="M3 5h2v2h2v2h2v2h2v2h-2v2h-2v2h-2v2H3V5zm9 0h2v2h2v2h2v2h2v2h-2v2h-2v2h-2v2h-2V5z" fill="currentColor" />
</svg>

// pixelarticons' heart, filled in.
export const HeartFull = (props: React.SVGProps<SVGSVGElement>) => <svg fill="none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {...props}>
    <path d="M9 2H5v2H3v2H1v6h2v2h2v2h2v2h2v2h2v2h2v-2h2v-2h2v-2h2v-2h2v-2h2V6h-2V4h-2V2h-4v2h-2v2h-2V4H9V2z" fill="currentColor" />
</svg>

// A QR code, as small as one can be drawn: its three corner marks and a few dots.
export const QRIcon = (props: React.SVGProps<SVGSVGElement>) => <svg fill="none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {...props}>
    <path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm8-2h2v2h-2v-2zm4 0h4v2h-4v-2zm-2 2h2v2h-2v-2zm-2 2h2v4h-2v-4zm4 0h2v2h-2v-2zm2 2h2v2h-2v-2zm-2 0h2v2h-2v-2z" fill="currentColor" />
</svg>

// The card's score: notes going by, low to high (as a piano roll draws them).
export const ScoreIcon = (props: React.SVGProps<SVGSVGElement>) => <svg fill="none" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" {...props}>
    <path d="M2 16h5v3H2zM7 11h4v3H7zM11 5h5v3h-5zM13 15h4v3h-4zM17 9h5v3h-5zM19 17h3v3h-3z" fill="currentColor" />
</svg>
