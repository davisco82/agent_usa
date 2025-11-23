// cities.js – regions + importance for train logic

export const CITIES = [

  // ------------------------------------------------------
  // 🌲 PACIFIC NORTHWEST
  // ------------------------------------------------------
  {
    name: "Seattle",
    region: "pacific_northwest",
    importance: 1,
    lat: 46.90620, lon: -119.13210,
    px: 52.16, py: 52.88, x: 7, y: 7
  },
  {
    name: "Portland",
    region: "pacific_northwest",
    importance: 2,
    lat: 45.20510, lon: -119.72500,
    px: 32.74, py: 118.10, x: 4, y: 15
  },
  {
    name: "Spokane",
    region: "pacific_northwest",
    importance: 3,
    lat: 46.05880, lon: -115.42600,
    px: 98.12, py: 51.63, x: 12, y: 6
  },
  {
    name: "Boise",
    region: "pacific_northwest",
    importance: 2,
    lat: 42.1150, lon: -115.1023,
    px: 120.38, py: 147.02, x: 15, y: 18
  },
  {
    name: "Helena",
    region: "pacific_northwest",
    importance: 3,
    lat: 44.9884, lon: -111.0245,
    px: 196.35, py: 76.88, x: 25, y: 10
  },
  {
    name: "Bismarck",
    region: "pacific_northwest",
    importance: 3,
    lat: 44.2083, lon: -100.7837,
    px: 400.77, py: 71.70, x: 50, y: 9
  },

  // ------------------------------------------------------
  // 🌊 PACIFIC SOUTHWEST / WEST COAST
  // ------------------------------------------------------
  {
    name: "San Francisco",
    region: "pacific_southwest",
    importance: 2,
    lat: 37.77490, lon: -121.41940,
    px: 48.33, py: 291.42, x: 6, y: 36
  },
  {
    name: "Oakland",
    region: "pacific_southwest",
    importance: 3,
    lat: 37.90440, lon: -121.27110,
    px: 55.50, py: 293.02, x: 7, y: 37
  },
  {
    name: "San Jose",
    region: "pacific_southwest",
    importance: 2,
    lat: 37.33820, lon: -120.88630,
    px: 58.12, py: 308.37, x: 7, y: 39
  },
  {
    name: "Sacramento",
    region: "pacific_southwest",
    importance: 2,
    lat: 38.58160, lon: -120.59440,
    px: 73.45, py: 294.74, x: 9, y: 37
  },
  {
    name: "Fresno",
    region: "pacific_southwest",
    importance: 3,
    lat: 36.73780, lon: -119.78710,
    px: 115.24, py: 331.69, x: 14, y: 41
  },
  {
    name: "Bakersfield",
    region: "pacific_southwest",
    importance: 3,
    lat: 35.37330, lon: -119.01870,
    px: 119.04, py: 351.47, x: 15, y: 44
  },
  {
    name: "Los Angeles",
    region: "pacific_southwest",
    importance: 1,
    lat: 34.05220, lon: -118.24370,
    px: 83.25, py: 372.58, x: 10, y: 47
  },
  {
    name: "San Diego",
    region: "pacific_southwest",
    importance: 2,
    lat: 32.71570, lon: -117.16110,
    px: 102.94, py: 404.09, x: 13, y: 51
  },
  {
    name: "Eureka",
    region: "pacific_southwest",
    importance: 3,
    lat: 41.00210, lon: -122.16370,
    px: -24.41, py: 213.36, x: -3, y: 27
  },

  // ------------------------------------------------------
  // 🏔 MOUNTAIN REGION
  // ------------------------------------------------------
  {
    name: "Las Vegas",
    region: "mountain",
    importance: 2,
    lat: 36.16990, lon: -115.13980,
    px: 165.88, py: 343.44, x: 21, y: 43
  },
  {
    name: "Phoenix",
    region: "mountain",
    importance: 2,
    lat: 32.84840, lon: -112.07400,
    px: 195.45, py: 386.82, x: 24, y: 48
  },
  {
    name: "Tucson",
    region: "mountain",
    importance: 3,
    lat: 31.80260, lon: -110.97470,
    px: 222.21, py: 426.22, x: 28, y: 53
  },
  {
    name: "Salt Lake City",
    region: "mountain",
    importance: 2,
    lat: 39.76080, lon: -111.89100,
    px: 247.88, py: 301.44, x: 31, y: 38
  },
  {
    name: "Denver",
    region: "mountain",
    importance: 1,
    lat: 37.53920, lon: -104.99030,
    px: 345.79, py: 268.54, x: 43, y: 34
  },
  {
    name: "Colorado Springs",
    region: "mountain",
    importance: 2,
    lat: 36.83390, lon: -104.82140,
    px: 345.15, py: 294.17, x: 43, y: 37
  },
  {
    name: "Santa Fe",
    region: "mountain",
    importance: 3,
    lat: 34.7870, lon: -105.9378,
    px: 307.04, py: 334.02, x: 38, y: 42
  },
  {
    name: "Albuquerque",
    region: "mountain",
    importance: 2,
    lat: 33.88440, lon: -106.65040,
    px: 293.59, py: 373.88, x: 37, y: 47
  },
  {
    name: "Cheyenne",
    region: "mountain",
    importance: 3,
    lat: 39.1000, lon: -104.1202,
    px: 327.37, py: 205.39, x: 41, y: 26
  },
  {
    name: "Pierre",
    region: "mountain",
    importance: 3,
    lat: 41.9683, lon: -100.3500,
    px: 408.66, py: 129.25, x: 51, y: 16
  },
  {
    name: "Sheridan",
    region: "mountain",
    importance: 3,
    lat: 42.5972, lon: -106.9562,
    px: 288.52, py: 119.13, x: 36, y: 15
  },

  // ------------------------------------------------------
  // 🌾 MIDWEST NORTH
  // ------------------------------------------------------
  {
    name: "Minneapolis",
    region: "midwest_north",
    importance: 2,
    lat: 42.97780, lon: -93.26500,
    px: 553.98, py: 179.52, x: 69, y: 22
  },
  {
    name: "Milwaukee",
    region: "midwest_north",
    importance: 3,
    lat: 41.23890, lon: -89.70650,
    px: 649.26, py: 196.65, x: 81, y: 25
  },
  {
    name: "Chicago",
    region: "midwest_north",
    importance: 1,
    lat: 39.47810, lon: -89.12980,
    px: 639.98, py: 187.98, x: 80, y: 23
  },
  {
    name: "Detroit",
    region: "midwest_north",
    importance: 2,
    lat: 40.53140, lon: -84.54580,
    px: 721.73, py: 209.55, x: 90, y: 26
  },

  // ------------------------------------------------------
  // 🌾 MIDWEST SOUTH / CENTRAL
  // ------------------------------------------------------
  {
    name: "Kansas City",
    region: "midwest_central",
    importance: 2,
    lat: 37.09970, lon: -94.57860,
    px: 533.52, py: 283.86, x: 67, y: 35
  },
  {
    name: "St. Louis",
    region: "midwest_central",
    importance: 1,
    lat: 36.62700, lon: -90.19940,
    px: 582.80, py: 306.23, x: 73, y: 38
  },
  {
    name: "Indianapolis",
    region: "midwest_central",
    importance: 2,
    lat: 37.96840, lon: -86.65810,
    px: 681.72, py: 252.55, x: 85, y: 32
  },
  {
    name: "Cincinnati",
    region: "midwest_central",
    importance: 3,
    lat: 37.30310, lon: -84.91200,
    px: 659.91, py: 272.20, x: 82, y: 34
  },
  {
    name: "Columbus",
    region: "midwest_central",
    importance: 2,
    lat: 38.36120, lon: -83.29880,
    px: 733.60, py: 244.13, x: 92, y: 31
  },
  {
    name: "Omaha",
    region: "midwest_central",
    importance: 3,
    lat: 39.25650, lon: -95.93450,
    px: 508.67, py: 245.83, x: 64, y: 31
  },
  {
    name: "Wichita",
    region: "midwest_central",
    importance: 3,
    lat: 35.68720, lon: -97.33010,
    px: 456.90, py: 320.42, x: 57, y: 40
  },
  {
    name: "Tulsa",
    region: "midwest_central",
    importance: 2,
    lat: 34.15398, lon: -95.99277,
    px: 516.35, py: 340.83, x: 65, y: 43
  },
  {
    name: "Little Rock",
    region: "midwest_central",
    importance: 3,
    lat: 32.7465, lon: -92.2896,
    px: 555.24, py: 356.20, x: 69, y: 45
  },

  // ------------------------------------------------------
  // 🌵 SOUTHWEST
  // ------------------------------------------------------
  {
    name: "El Paso",
    region: "southwest",
    importance: 1,
    lat: 31.36190, lon: -107.18500,
    px: 336.41, py: 470.89, x: 42, y: 59
  },
  {
    name: "Amarillo",
    region: "southwest",
    importance: 2,
    lat: 32.75550, lon: -100.33080,
    px: 472.17, py: 431.26, x: 59, y: 54
  },

  // ------------------------------------------------------
  // 🔥 SOUTH CENTRAL
  // ------------------------------------------------------
  {
    name: "Dallas",
    region: "south_central",
    importance: 2,
    lat: 31.47670, lon: -96.79700,
    px: 483.21, py: 432.90, x: 60, y: 54
  },
  {
    name: "Austin",
    region: "south_central",
    importance: 2,
    lat: 29.46720, lon: -98.74310,
    px: 462.00, py: 459.38, x: 58, y: 57
  },
  {
    name: "San Antonio",
    region: "south_central",
    importance: 2,
    lat: 28.52410, lon: -100.49360,
    px: 442.42, py: 481.74, x: 55, y: 60
  },
  {
    name: "Houston",
    region: "south_central",
    importance: 1,
    lat: 29.16040, lon: -96.36980,
    px: 499.23, py: 473.81, x: 62, y: 59
  },
  {
    name: "Jackson",
    region: "south_central",
    importance: 3,
    lat: 31.0288, lon: -90.1848,
    px: 593.52, py: 413.93, x: 74, y: 52
  },
  {
    name: "New Orleans",
    region: "south_central",
    importance: 2,
    lat: 29.25110, lon: -90.67150,
    px: 587.99, py: 485.42, x: 73, y: 61
  },
  {
    name: "Memphis",
    region: "south_central",
    importance: 3,
    lat: 33.14950, lon: -90.04900,
    px: 576.40, py: 352.44, x: 72, y: 44
  },

  // ------------------------------------------------------
  // 🌴 SOUTHEAST
  // ------------------------------------------------------
  {
    name: "Atlanta",
    region: "southeast",
    importance: 1,
    lat: 32.74900, lon: -84.38800,
    px: 667.02, py: 382.22, x: 83, y: 48
  },
  {
    name: "Montgomery",
    region: "southeast",
    importance: 3,
    lat: 31.37920, lon: -86.30770,
    px: 664.03, py: 412.04, x: 83, y: 52
  },
  {
    name: "Charlotte",
    region: "southeast",
    importance: 2,
    lat: 34.42710, lon: -80.84310,
    px: 743.36, py: 335.43, x: 93, y: 42
  },
  {
    name: "Raleigh",
    region: "southeast",
    importance: 3,
    lat: 34.97960, lon: -79.63820,
    px: 795.60, py: 332.32, x: 99, y: 42
  },
  {
    name: "Jacksonville",
    region: "southeast",
    importance: 2,
    lat: 30.33220, lon: -81.65570,
    px: 772.63, py: 431.36, x: 97, y: 54
  },
  {
    name: "Tampa",
    region: "southeast",
    importance: 2,
    lat: 27.95060, lon: -82.45720,
    px: 758.02, py: 515.45, x: 95, y: 64
  },
  {
    name: "Miami",
    region: "southeast",
    importance: 2,
    lat: 25.76170, lon: -80.19180,
    px: 782.04, py: 568.13, x: 98, y: 71
  },

  // ------------------------------------------------------
  // 🗽 NORTHEAST
  // ------------------------------------------------------
  {
    name: "Pittsburgh",
    region: "northeast",
    importance: 3,
    lat: 38.74060, lon: -80.39590,
    px: 784.64, py: 241.23, x: 98, y: 30
  },
  {
    name: "Cleveland",
    region: "northeast",
    importance: 2,
    lat: 39.89930, lon: -82.49440,
    px: 748.82, py: 226.14, x: 94, y: 28
  },
  {
    name: "Buffalo",
    region: "northeast",
    importance: 3,
    lat: 41.08640, lon: -80.47840,
    px: 799.13, py: 164.20, x: 100, y: 21
  },
  {
    name: "Albany",
    region: "northeast",
    importance: 3,
    lat: 41.25260, lon: -76.25620,
    px: 892.28, py: 169.72, x: 112, y: 21
  },
  {
    name: "New York",
    region: "northeast",
    importance: 1,
    lat: 40.11280, lon: -76.00600,
    px: 887.74, py: 215.47, x: 111, y: 27
  },
  {
    name: "Philadelphia",
    region: "northeast",
    importance: 2,
    lat: 39.05260, lon: -76.26520,
    px: 866.66, py: 233.40, x: 108, y: 29
  },
  {
    name: "Baltimore",
    region: "northeast",
    importance: 2,
    lat: 38.29040, lon: -77.91220,
    px: 827.97, py: 260.54, x: 103, y: 33
  },
  {
    name: "Washington",
    region: "northeast",
    importance: 2,
    lat: 37.70720, lon: -78.23690,
    px: 816.44, py: 276.84, x: 102, y: 35
  },
  {
    name: "Boston",
    region: "northeast",
    importance: 2,
    lat: 41.36010, lon: -73.05890,
    px: 941.33, py: 210.33, x: 118, y: 26
  },

];
