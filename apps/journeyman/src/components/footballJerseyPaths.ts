/**
 * Football jersey artwork path data, extracted from the user-supplied
 * "Football_Jersey_NovaeMakersMart" SVG (front view, shapes only — no
 * logos or wordmarks). Coordinates are in the source sheet space;
 * FootballJerseyRenderer sets the viewBox around the front jersey.
 * Polygons from the source are converted to path strings.
 */

/** dark under-layer: sleeve cuffs + lower-body depth (paint primary, then shade) */
export const BASE: string = "M1001.4,532.1l77.5-32.2l-14.3-34.5l-28.8-80.2c-5.4-15.1-17.1-27.1-32.1-32.8l-56.1-21.7l-15.3-15.1H807.5    l-15.3,15.1l-56,21.6c-14.9,5.8-26.6,17.7-32.1,32.8l-29.7,82.7l-13.3,32.1l77.5,32.2l13.2-31.8l0.1-0.1c0,0-4.4,157.8-8.5,231.2    h253.4c-4-73.5-8.5-231.2-8.5-231.2l0.4,0.9L1001.4,532.1z";

/** main jersey body incl. sleeves and V-neck cutout */
export const BODY: string = "M670,478.5l-8.9,21.4l77.5,32.2l13.2-31.8l0.1-0.1l20.9,231.2H967l21.3-231.2l0.4,0.9l12.7,31l77.5-32.2    l-14.3-34.5l-2.3-6.4l0,0l-26.5-73.8c-5.4-15.1-17.1-27.1-32.1-32.8l-56.1-21.7l-15.3-15.1h-0.8l-53.7,53.7    c-4.3,4.3-11.3,4.3-15.6,0l-53.7-53.7h-1l-15.3,15.1l-56,21.6c-3.1,1.2-6.1,2.7-9,4.5c-1.1,0.7-2.2,1.4-3.2,2.2    c-0.4,0.3-0.8,0.6-1.2,0.9c-1.4,1.1-2.7,2.2-4,3.3c-0.7,0.7-1.4,1.3-2.1,2c-0.8,0.8-1.6,1.7-2.4,2.6l0,0c-0.7,0.8-1.4,1.7-2.1,2.6    c-0.1,0.1-0.2,0.3-0.3,0.4c-0.5,0.7-1.1,1.5-1.6,2.2c-0.2,0.2-0.3,0.4-0.5,0.7c-0.5,0.7-0.9,1.4-1.4,2.2c-0.1,0.2-0.3,0.5-0.4,0.7    c-0.5,1-1.1,1.9-1.6,2.9c-0.9,1.8-1.7,3.6-2.3,5.5l-29.7,82.7L670,478.5L670,478.5z";

/** V-neck collar band */
export const COLLAR: string = "M808.5,316.2l53.7,53.7c4.3,4.3,11.3,4.3,15.6,0l53.7-53.7H808.5L808.5,316.2z";

/** inner neckline area between collar band and yoke */
export const COLLAR_INNER: string = "M880.6,390.3l61.1-61.1l-10.2-9.6l-50.1,51.9c-3,3.1-7,4.8-11.3,4.8s-8.3-1.7-11.3-4.8l-50.7-52.4l-10.1,9.8    l61.6,61.5C865.4,396.1,874.8,396.1,880.6,390.3z";

/** shoulder yoke region (shadow in source; color-blocked in the modern era) */
export const YOKE: string = "M1035.8,385.2c-5.4-15.1-17.1-27.1-32.1-32.8l-56.1-21.7l-15.3-15.1h-0.8l-53.7,53.7    c-4.3,4.3-11.3,4.3-15.6,0l-53.7-53.7h-1l-15.3,15.1l-56,21.6c-3.1,1.2-6.1,2.7-9,4.5c-1.1,0.7-2.2,1.4-3.2,2.2    c-0.4,0.3-0.8,0.6-1.2,0.9c-1.4,1.1-2.7,2.2-4,3.3c-0.7,0.7-1.4,1.3-2.1,2c-0.8,0.8-1.6,1.7-2.4,2.6l0,0c-0.7,0.8-1.4,1.7-2.1,2.6    c-0.1,0.1-0.2,0.3-0.3,0.4c-0.5,0.7-1.1,1.5-1.6,2.2c-0.2,0.2-0.3,0.4-0.5,0.7c-0.5,0.7-0.9,1.4-1.4,2.2c-0.1,0.2-0.3,0.5-0.4,0.7    c-0.5,1-1.1,1.9-1.6,2.9c-0.9,1.8-1.7,3.6-2.3,5.5l-7.3,20.3l62.9,26.3l91-44.6l7,7c3.3,3.3,7.7,5.1,12.4,5.1s9.1-1.8,12.4-5.1    l7-7l90.9,44.5h0.1l62.6-26.2L1035.8,385.2z";

/** outer (white in source) sleeve-cap stripe bands, left+right */
export const STRIPE_OUTER: string[] = ["M664.7,491.7L674.6,467.9L751.9,500.3L751.5,501.1L742.1,524.1Z", "M1075.5,491.7L1065.7,467.9L988.4,500.3L988.7,501.1L998.1,524.1Z"];

/** inner (yellow in source) sleeve-cap stripes, layered over the outer band */
export const STRIPE_INNER: string[] = ["M744.6,517.9L749.1,507L671.8,474.6L667.2,485.6Z", "M991.1,507L995.6,517.9L1073,485.6L1068.4,474.6Z"];
