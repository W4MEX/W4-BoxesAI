function assetUrl({ filename }: { filename: string }): string {
    return `/w4-brand/${filename}`
}

export const w4Branding = Object.freeze({
    websiteName: 'W4-BoxesAI',
    primaryColor: '#087f5b',
    logos: {
        fullLogoUrl: assetUrl({ filename: 'full-logo.svg' }),
        logoIconUrl: assetUrl({ filename: 'icon.svg' }),
        favIconUrl: assetUrl({ filename: 'icon.svg' }),
    },
})
