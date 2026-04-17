import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

// --- Ícones Principais (strokeWidth="1.5") ---

const SidebarIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

const ChevronUpIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="18 15 12 9 6 15" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

const DashboardIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="5" rx="1" />
    <rect x="14" y="12" width="7" height="9" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
  </svg>
);


const LogoutIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

// --- Ícones dos Subitens ---


const ClientesIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);


const JobsIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="7" width="20" height="14" rx="2" />
    <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
  </svg>
);

// --- Mapeamento tab → { category, subItem } ---

function tabToRoute(tab: string): { category: string; subItem: string } {
  switch (tab) {
    case 'dashboard': return { category: 'Dashboard',  subItem: '' };
    case 'clients':   return { category: 'Clientes',   subItem: '' };
    case 'jobs':      return { category: 'Trabalhos',  subItem: '' };
    case 'settings':  return { category: '__settings__', subItem: '' };
    default:          return { category: 'Dashboard',  subItem: '' };
  }
}

function routeToTab(category: string, _subItem: string): string | null {
  if (category === 'Dashboard') return 'dashboard';
  if (category === 'Clientes')  return 'clients';
  if (category === 'Trabalhos') return 'jobs';
  return null;
}

// --- Types ---

interface SubItem {
  name: string;
  icon: () => JSX.Element;
}

interface MenuItem {
  name: string;
  icon: () => JSX.Element;
  hasArrow: boolean;
  subItems?: SubItem[];
}

interface AdminSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  onSignOut: () => void;
  isCollapsed: boolean;
  onCollapsedChange: (value: boolean) => void;
}

// --- Componente ---

const AdminSidebar = ({ activeTab, onTabChange, onSignOut, isCollapsed, onCollapsedChange }: AdminSidebarProps) => {
  const initialRoute = tabToRoute(activeTab);
  const [activeRoute, setActiveRoute] = useState(initialRoute);
  const [expandedCategory, setExpandedCategory] = useState(
    initialRoute.subItem ? initialRoute.category : ''
  );
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const [photographerName, setPhotographerName] = useState('');
  const [photographerInitial, setPhotographerInitial] = useState('');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('photographers').select('name').eq('user_id', user.id).single()
        .then(({ data }) => {
          if (data?.name) {
            setPhotographerName(data.name);
            setPhotographerInitial(data.name.charAt(0).toUpperCase());
          }
        });
    });
  }, []);

  // Sincroniza rota quando activeTab muda externamente
  useEffect(() => {
    const route = tabToRoute(activeTab);
    setActiveRoute(route);
    if (route.subItem) setExpandedCategory(route.category);
  }, [activeTab]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCategoryClick = (item: MenuItem) => {
    if (item.subItems) {
      if (isCollapsed) {
        onCollapsedChange(false);
        setExpandedCategory(item.name);
      } else {
        setExpandedCategory((prev) => (prev === item.name ? '' : item.name));
      }
    } else {
      setActiveRoute({ category: item.name, subItem: '' });
      setExpandedCategory('');
      const tab = routeToTab(item.name, '');
      if (tab) onTabChange(tab);
    }
  };

  const handleSubItemClick = (categoryName: string, subItemName: string) => {
    setActiveRoute({ category: categoryName, subItem: subItemName });
    setExpandedCategory(categoryName);
    const tab = routeToTab(categoryName, subItemName);
    if (tab) onTabChange(tab);
  };

  const menuItems: MenuItem[] = [
    { name: 'Dashboard', icon: DashboardIcon, hasArrow: false },
    { name: 'Clientes',  icon: ClientesIcon,  hasArrow: false },
    { name: 'Trabalhos', icon: JobsIcon,      hasArrow: false },
  ];

  return (
    <aside className={cn("fixed left-0 top-0 z-40 h-screen transition-all duration-300 ease-in-out", isCollapsed ? "w-[88px]" : "w-[280px]")} style={{ borderRight: '6px solid #E8E8E8' }}>
      <div className="bg-[#F2F2F2] h-full p-4 flex flex-col transition-all duration-300 ease-in-out">

        {/* Logo */}
        <div className={cn("flex items-center mb-8 mt-2 transition-all duration-300", isCollapsed ? "justify-center px-0" : "justify-between px-2")}>
          
          {/* Container da SUA Logo Original com animação de esconder */}
          <div className={cn("flex items-center overflow-hidden transition-all duration-300 ease-in-out", isCollapsed ? "w-0 opacity-0" : "w-[120px] opacity-100")}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="583 1302 2344 787" className="h-6 w-auto flex-shrink-0">
              {/* F */}
              <path fill="#000000" d="M671.018799,1899.991943 C670.882263,1924.173706 670.882263,1947.360229 670.882263,1970.281372 C659.960144,1974.517578 593.578369,1974.618774 583.920593,1970.247314 C583.920593,1951.067383 583.902466,1931.453247 583.923828,1911.839111 C584.004822,1837.542114 584.174927,1763.245117 584.169861,1688.948120 C584.162048,1574.997437 584.029968,1461.046875 583.973206,1347.096191 C583.967896,1336.434082 584.192444,1325.772095 584.184875,1315.109985 C584.177185,1304.371338 585.460815,1302.829102 596.052246,1302.811523 C637.377319,1302.742920 678.702637,1302.763916 720.027832,1302.758789 C806.344238,1302.748169 892.660706,1302.728149 978.977112,1302.773071 C983.497986,1302.775513 988.018616,1303.344849 993.170166,1303.692871 C993.170166,1329.093750 993.170166,1353.299438 993.170166,1378.718506 C990.041626,1379.060547 986.885193,1379.718140 983.732849,1379.698975 C965.081665,1379.585815 946.431519,1379.142212 927.780823,1379.128296 C846.796570,1379.067993 765.812378,1379.117676 684.828125,1379.127197 C680.896973,1379.127686 676.965881,1379.127319 671.628418,1379.127319 C670.565308,1454.246338 671.191895,1528.317139 671.155396,1603.797974 C675.930298,1603.797974 679.805725,1603.798218 683.681091,1603.797974 C771.664001,1603.794556 859.646851,1603.790771 947.629761,1603.787720 C950.629150,1603.787598 953.632019,1603.700439 956.627319,1603.812500 C963.992310,1604.088257 964.301636,1604.423218 964.361450,1611.952637 C964.512146,1630.918701 964.670349,1649.884766 964.734924,1668.851196 C964.746033,1672.121704 964.312073,1675.393677 964.019348,1679.585693 C866.719666,1679.585693 769.895325,1679.585693 671.779480,1679.585693 C671.456787,1689.338867 670.935974,1698.196655 670.910645,1707.055664 C670.809326,1742.535645 670.822388,1778.016113 670.869629,1813.496338 C670.907593,1841.996582 671.055908,1870.496460 671.018799,1899.991943z"/>
              {/* O */}
              <path fill="#000000" d="M1060.345703,1659.542725 C1068.027954,1618.497192 1083.770264,1581.832031 1108.807007,1549.438721 C1138.557129,1510.947021 1177.463135,1486.590210 1224.757446,1475.156738 C1248.625977,1469.386353 1272.640625,1468.987549 1297.009033,1469.531006 C1322.414551,1470.097412 1346.406372,1475.977173 1369.671387,1485.197266 C1405.781006,1499.507935 1435.147217,1522.609985 1458.227173,1554.049316 C1480.690186,1584.648193 1494.614014,1618.686157 1502.528687,1655.573364 C1508.213013,1682.066162 1510.262939,1708.875854 1509.526489,1735.801514 C1508.296875,1780.755737 1499.921021,1824.283203 1479.395264,1864.762939 C1464.020996,1895.083740 1443.330811,1921.271729 1415.782471,1941.480347 C1386.645264,1962.855225 1354.544434,1976.815186 1318.172852,1981.109009 C1297.287354,1983.574829 1276.729248,1985.466553 1255.691162,1982.778809 C1235.550781,1980.205811 1215.745361,1976.954590 1196.811523,1969.323120 C1145.589233,1948.677246 1108.302490,1913.505005 1083.723511,1863.933228 C1074.308960,1844.945679 1067.295898,1825.371338 1062.450195,1805.020752 C1059.001953,1790.538574 1056.232666,1775.613892 1055.651367,1760.788940 C1054.466553,1730.567627 1052.889038,1700.214478 1058.172607,1670.127441 C1058.746216,1666.860474 1059.542969,1663.632690 1060.345703,1659.542725M1309.858643,1907.720337 C1312.774170,1907.078491 1315.712646,1906.525635 1318.601440,1905.779785 C1334.200684,1901.752197 1348.900024,1895.536743 1361.509399,1885.463989 C1381.550903,1869.454590 1396.682617,1849.788696 1406.855957,1825.878052 C1419.710571,1795.665039 1424.852173,1764.057007 1426.085083,1731.735474 C1426.612671,1717.901123 1424.468262,1703.924927 1423.042725,1690.064087 C1419.874878,1659.260620 1411.276001,1630.135010 1394.452148,1603.887451 C1375.223022,1573.887207 1349.410278,1552.324829 1313.619873,1545.719482 C1300.381592,1543.276367 1286.541016,1543.861938 1272.963867,1543.542358 C1251.169800,1543.029541 1230.924805,1548.771362 1212.438110,1560.230835 C1189.223145,1574.620850 1172.262207,1594.816040 1160.526001,1619.212646 C1148.640015,1643.920898 1141.437744,1669.895386 1139.464233,1697.528442 C1137.177734,1729.542236 1137.695312,1761.221313 1145.641235,1792.408691 C1154.420166,1826.865356 1169.363403,1857.830078 1197.271362,1881.387329 C1215.083130,1896.422363 1235.245972,1905.382324 1258.370117,1908.023560 C1274.970337,1909.919678 1291.522461,1909.570190 1309.858643,1907.720337z"/>
              {/* T */}
              <path fill="#000000" d="M1581.102783,1475.889771 C1574.249512,1476.098633 1567.396240,1476.307495 1560.019531,1476.532227 C1556.890015,1498.573364 1558.604492,1519.549805 1558.571655,1540.456421 C1558.568604,1542.455811 1560.334473,1544.458252 1561.380981,1546.675171 C1565.826782,1546.675171 1569.808472,1546.683105 1573.790161,1546.673706 C1591.765625,1546.631470 1609.741089,1546.524536 1627.716309,1546.571167 C1633.967651,1546.587280 1635.392944,1547.987915 1635.930420,1553.918457 C1636.110107,1555.901978 1635.984497,1557.913940 1635.984741,1559.912842 C1635.992188,1655.195312 1635.884644,1750.478027 1636.135376,1845.759888 C1636.170166,1859.002197 1636.982788,1872.403687 1639.146851,1885.447510 C1644.775391,1919.373047 1663.111816,1944.640869 1693.484619,1961.045044 C1715.390381,1972.876221 1739.074951,1976.838867 1763.627930,1977.398804 C1782.245361,1977.823242 1800.824097,1977.749146 1819.044434,1973.421021 C1828.507446,1971.173096 1829.808350,1968.851807 1828.814331,1959.357910 C1828.537842,1956.717651 1827.931519,1954.107178 1827.393433,1951.500122 C1824.642212,1938.170532 1821.829834,1924.853638 1819.105225,1911.518555 C1816.883301,1900.644409 1815.350342,1899.848999 1804.213257,1901.966064 C1785.431030,1905.536499 1766.624390,1906.703247 1748.014038,1900.770630 C1736.215942,1897.009399 1728.122192,1889.524536 1723.455200,1877.844971 C1719.891968,1868.927612 1719.151611,1859.753662 1719.057617,1850.438599 C1718.735962,1818.566772 1718.509033,1786.693726 1718.396606,1754.820557 C1718.291016,1724.863892 1718.373047,1694.906738 1718.378296,1664.949707 C1718.384399,1631.018188 1718.333008,1597.086548 1718.474487,1563.155518 C1718.496216,1557.948364 1719.420166,1552.744873 1720.022827,1546.554321 C1731.189331,1546.554321 1741.455811,1546.526489 1751.721924,1546.560425 C1770.031738,1546.620850 1788.342041,1546.834717 1806.651245,1546.760132 C1818.854004,1546.710327 1819.821655,1545.731689 1819.861450,1533.795288 C1819.912598,1518.480713 1819.814209,1503.163330 1819.554932,1487.850952 C1819.355225,1476.063721 1819.017456,1475.837280 1806.805298,1475.822632 C1781.484375,1475.792114 1756.163452,1475.828003 1730.842529,1475.836060 C1727.285034,1475.837280 1723.727539,1475.836304 1719.903198,1475.836304 C1719.378052,1472.289429 1718.753784,1470.049194 1718.759033,1467.810669 C1718.829834,1437.543701 1719.080200,1407.276855 1719.057251,1377.010132 C1719.051758,1369.846436 1718.200684,1362.683350 1717.718262,1355.205811 C1689.886841,1355.205811 1663.411499,1355.205811 1637.252197,1355.205811 C1636.646118,1356.454224 1636.115601,1357.042358 1636.107178,1357.637695 C1635.781616,1380.936401 1635.373901,1404.235352 1635.271118,1427.535522 C1635.215332,1440.177979 1635.776733,1452.822021 1635.896118,1465.466919 C1635.989868,1475.393555 1635.639893,1475.728149 1626.054932,1475.794678 C1611.729126,1475.894287 1597.402588,1475.863647 1581.102783,1475.889771z"/>
              {/* U */}
              <path fill="#000000" d="M1957.999268,1475.796509 C1967.995850,1475.796997 1976.994141,1475.760132 1985.991943,1475.807373 C1997.038696,1475.865356 1997.411987,1476.211182 1997.404419,1486.896484 C1997.382690,1517.867676 1997.302612,1548.838989 1997.273804,1579.810181 C1997.211670,1646.394775 1997.202026,1712.979492 1997.097412,1779.564087 C1997.058350,1804.458496 2000.067383,1828.766602 2011.605347,1851.220337 C2022.484619,1872.392212 2038.950195,1887.746948 2061.242188,1896.574585 C2099.305420,1911.648193 2136.596436,1907.614258 2172.031494,1889.363159 C2199.946045,1874.985718 2216.931152,1850.635498 2225.787598,1820.517578 C2231.316895,1801.713013 2231.331299,1782.439453 2231.552979,1763.167480 C2231.763672,1744.853027 2231.661621,1726.534546 2231.669189,1708.217896 C2231.695312,1644.255493 2231.723877,1580.293091 2231.711914,1516.330688 C2231.710205,1506.677368 2231.092773,1497.007324 2231.488770,1487.375122 C2231.913330,1477.057007 2233.223877,1476.014160 2243.393311,1475.941284 C2264.387695,1475.790649 2285.383057,1475.807739 2306.378174,1475.834229 C2308.955078,1475.837524 2311.531494,1476.320312 2315.417969,1476.713623 C2315.417969,1483.466675 2315.424805,1489.731689 2315.416992,1495.996826 C2315.326904,1569.910400 2315.178223,1643.824097 2315.160889,1717.737671 C2315.147705,1773.332520 2315.311279,1828.927490 2315.377686,1884.522339 C2315.409180,1910.835449 2315.446045,1937.148804 2315.378174,1963.461670 C2315.353760,1972.976196 2314.497803,1973.230957 2304.896729,1973.136597 C2287.994629,1972.970703 2271.075684,1973.025269 2254.184814,1973.602661 C2237.940918,1974.157959 2235.491699,1972.614990 2235.178955,1956.457275 C2234.863525,1940.160034 2235.373047,1923.847778 2235.397461,1907.541870 C2235.402832,1904.031738 2234.878906,1900.520752 2234.400391,1894.523193 C2228.857666,1902.391602 2224.490723,1908.037720 2220.710205,1914.052490 C2202.713379,1942.685791 2175.991943,1959.314087 2144.962158,1970.667603 C2125.891357,1977.645630 2106.204834,1980.547485 2086.286133,1980.242676 C2046.948608,1979.640869 2010.033203,1969.942505 1977.794434,1946.277588 C1956.277222,1930.482788 1941.790527,1909.139893 1931.412354,1884.895508 C1919.457031,1856.966187 1914.459106,1827.465088 1914.352295,1797.332520 C1913.988647,1694.710815 1914.156128,1592.087280 1914.156494,1489.464355 C1914.156616,1485.535034 1914.524658,1481.605713 1914.704224,1478.016479 C1916.313843,1477.182129 1917.174927,1476.355347 1918.051147,1476.338745 C1931.033081,1476.094727 1944.017090,1475.958374 1957.999268,1475.796509z"/>
              {/* X */}
              <path fill="#000000" d="M2428.760010,1475.825439 C2452.985596,1475.862793 2476.317627,1476.155029 2499.640137,1475.806030 C2508.764160,1475.669434 2514.196289,1479.312622 2518.761963,1487.133667 C2526.629883,1500.610962 2535.649170,1513.417603 2544.223145,1526.480835 C2572.678955,1569.834839 2600.538330,1613.556152 2625.969238,1658.780029 C2626.740479,1660.151489 2627.908691,1661.299683 2629.804199,1663.714233 C2633.269775,1657.987549 2636.567383,1653.195923 2639.209229,1648.066284 C2657.820801,1611.926880 2679.623779,1577.737549 2702.351807,1544.102783 C2716.310303,1523.446289 2730.282715,1502.798218 2744.054688,1482.017578 C2746.930664,1477.678101 2750.312988,1475.702271 2755.566162,1475.737305 C2780.893555,1475.906250 2806.222168,1475.789062 2831.550293,1475.875732 C2834.053955,1475.884277 2836.554932,1476.588989 2840.324463,1477.163940 C2838.982422,1480.461548 2838.408447,1482.988647 2837.060547,1484.996216 C2830.406982,1494.904419 2823.527344,1504.660645 2816.766846,1514.497437 C2802.086914,1535.856812 2787.398438,1557.210449 2772.772461,1578.606689 C2751.192871,1610.174805 2729.699463,1641.801880 2708.097656,1673.354614 C2698.717773,1687.055176 2689.177979,1700.646484 2679.673340,1714.261475 C2675.096924,1720.817017 2675.047852,1721.908691 2679.577881,1728.357422 C2719.521729,1785.219604 2759.505615,1842.053467 2799.388916,1898.958008 C2813.897949,1919.659180 2828.380615,1940.385132 2842.470459,1961.371338 C2852.067871,1975.665771 2860.580566,1990.691772 2870.258301,2004.928589 C2885.759277,2027.731934 2901.838135,2050.142578 2917.636475,2072.744385 C2920.235596,2076.462646 2922.649902,2080.310303 2926.123047,2085.573730 C2921.315430,2086.463623 2918.230957,2087.503662 2915.136963,2087.532715 C2889.837646,2087.771729 2864.536865,2087.839844 2839.236328,2087.915039 C2833.689941,2087.931396 2830.022949,2084.839355 2827.080322,2080.427490 C2816.932373,2065.213623 2806.707275,2050.051270 2796.495605,2034.880005 C2777.934814,2007.305298 2759.226807,1979.828735 2740.829102,1952.145752 C2716.539062,1915.596558 2692.158936,1879.099365 2668.462646,1842.166260 C2655.017334,1821.210327 2642.865479,1799.425049 2630.103027,1778.030151 C2629.627197,1777.232788 2628.852539,1776.613770 2627.250977,1774.844116 C2624.917969,1778.414062 2622.628906,1781.456299 2620.816406,1784.759888 C2596.495361,1829.087769 2568.667725,1871.215820 2540.411621,1913.074219 C2529.075439,1929.867432 2517.500977,1946.501221 2506.301514,1963.384399 C2501.830322,1970.124634 2496.299072,1972.931396 2488.023926,1972.790283 C2464.407471,1972.387573 2440.777588,1972.802246 2417.152832,1972.821411 C2414.238525,1972.823853 2411.323486,1972.377441 2407.292725,1972.047729 C2408.286133,1969.233276 2408.607910,1966.987183 2409.750732,1965.295288 C2418.312744,1952.618286 2427.007568,1940.030396 2435.715576,1927.452637 C2465.807129,1883.989258 2495.892090,1840.521240 2526.038330,1797.095581 C2542.347168,1773.602173 2558.817871,1750.220581 2575.125244,1726.725952 C2580.687744,1718.711670 2580.645996,1718.566895 2575.044434,1710.339111 C2559.170410,1687.022095 2543.209961,1663.763550 2527.303223,1640.468872 C2504.809082,1607.526978 2482.387451,1574.535522 2459.825439,1541.640137 C2447.605225,1523.823120 2435.104736,1506.198364 2422.864990,1488.394531 C2420.709961,1485.259888 2419.219238,1481.668579 2416.592041,1476.728516 C2421.552246,1476.330444 2424.707520,1476.077148 2428.760010,1475.825439z"/>
            </svg>
          </div>

          {/* Botão de Recolher/Expandir */}
          <button 
            onClick={() => onCollapsedChange(!isCollapsed)}
            className="text-[#666666] hover:text-[#1A1A1A] transition-colors p-1 rounded-sm hover:bg-[#E5E7EB] flex-shrink-0"
            title={isCollapsed ? "Expandir menu" : "Recolher menu"}
          >
            <SidebarIcon />
          </button>
        </div>

        {/* Navegação */}
        <nav className="flex flex-col gap-[3px] flex-1 overflow-y-auto mb-6">
          {menuItems.map((item, index) => {
            const Icon = item.icon;
            const isCategoryActive = activeRoute.category === item.name;
            const hasActiveSubItem = isCategoryActive && activeRoute.subItem !== '';
            const isExactMatch = isCategoryActive && activeRoute.subItem === '';
            const isOpen = expandedCategory === item.name && !isCollapsed;

            return (
              <div key={index} className="flex flex-col">
                {/* Item pai */}
                <div
                  onClick={() => handleCategoryClick(item)}
                  className={cn(
                    'group flex items-center py-[11px] cursor-pointer transition-all duration-200 ease-in-out relative',
                    isCollapsed ? 'px-0 justify-center rounded-[14px]' : 'px-4 rounded-r-[14px] rounded-l-none',
                    isExactMatch
                      ? 'bg-[#F0EFEC] text-[#1A1A1A]'
                      : hasActiveSubItem
                      ? 'text-[#666666] bg-transparent'
                      : 'text-[#666666] hover:bg-[#EFEFED] hover:text-[#1A1A1A]'
                  )}
                  title={isCollapsed ? item.name : ""}
                >
                  {/* Traço vertical esquerdo — indicador de seleção */}
                  {isExactMatch && !isCollapsed && (
                    <span className="absolute left-0 top-[20%] h-[60%] w-[3px] bg-[#1A1A1A] rounded-r-full" />
                  )}
                  <div className={cn(
                    'w-5 h-5 flex justify-center items-center flex-shrink-0 transition-colors duration-200',
                    isCollapsed ? 'mr-0' : 'mr-4',
                    isExactMatch ? 'text-[#1A1A1A]' : hasActiveSubItem ? 'text-[#4A4A4A]' : 'text-[#666666] group-hover:text-[#1A1A1A]'
                  )}>
                    <Icon />
                  </div>

                  <div className={cn("flex items-center overflow-hidden transition-all duration-300 ease-in-out", isCollapsed ? "w-0 opacity-0" : "flex-1 opacity-100")}>
                    <span className="flex-1 text-[14px] font-medium tracking-tight whitespace-nowrap">
                      {item.name}
                    </span>

                    {item.hasArrow && (
                      <div className={cn(
                        'transition-all duration-200 ease-in-out',
                        isExactMatch ? 'text-[#1A1A1A]' : hasActiveSubItem ? 'text-[#4A4A4A]' : 'text-[#666666]',
                        isOpen ? 'rotate-180' : ''
                      )}>
                        <ChevronDownIcon />
                      </div>
                    )}
                  </div>
                </div>

                {/* Subitens (gaveta) */}
                {item.subItems && (
                  <div className={cn(
                    'grid transition-all duration-200 ease-in-out',
                    isOpen ? 'grid-rows-[1fr] opacity-100 mt-1' : 'grid-rows-[0fr] opacity-0 mt-0'
                  )}>
                    <div className="overflow-hidden min-h-0">
                      <div className="flex flex-col gap-1 py-1 ml-8">
                        {item.subItems.map((subItem, subIndex) => {
                          const isSubActive = isCategoryActive && activeRoute.subItem === subItem.name;
                          const SubIcon = subItem.icon;

                          return (
                            <div
                              key={subIndex}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSubItemClick(item.name, subItem.name);
                              }}
                              className={cn(
                                'group flex items-center px-4 py-[10px] rounded-[14px] cursor-pointer transition-all duration-200 ease-in-out border-l-2 border-transparent',
                                isSubActive
                                  ? 'bg-[#F0EFEC] text-[#1A1A1A] font-bold border-l-[3px] border-[#1A1A1A]'
                                  : 'text-[#666666] hover:text-[#1A1A1A] hover:bg-[#EFEFED] font-semibold'
                              )}
                            >
                              <div className={cn(
                                'w-5 h-5 flex justify-center items-center mr-4 transition-colors duration-200',
                                isSubActive ? 'text-[#1A1A1A]' : 'text-[#666666] group-hover:text-[#1A1A1A]'
                              )}>
                                <SubIcon />
                              </div>
                              <span className={cn(
                                'flex-1 text-[14px] tracking-tight ml-1 transition-all duration-200',
                                isSubActive ? 'font-bold' : 'font-semibold'
                              )}>
                                {subItem.name}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Rodapé / Perfil */}
        <div ref={profileMenuRef} className="mt-auto pt-4 border-t border-[#E5E7EB] relative">

          {/* Dropdown */}
          {isProfileMenuOpen && (
            <div className="absolute bottom-[calc(100%+8px)] left-0 w-[248px] bg-[#F2F2F2] border border-[#E5E7EB] rounded-[16px] shadow-[0_8px_32px_0_rgba(0,0,0,0.08)] p-1.5 z-50 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex flex-col">
                <button
                  onClick={() => { onTabChange('settings'); setIsProfileMenuOpen(false); }}
                  className="text-left w-full px-3 py-2 text-[14px] font-medium text-[#4A4A4A] hover:text-[#1A1A1A] hover:bg-[#EFEFED] rounded-[10px] transition-colors"
                >
                  Configurações da Conta
                </button>
                <button
                  onClick={() => { onTabChange('settings'); setIsProfileMenuOpen(false); }}
                  className="text-left w-full px-3 py-2 text-[14px] font-medium text-[#4A4A4A] hover:text-[#1A1A1A] hover:bg-[#EFEFED] rounded-[10px] transition-colors"
                >
                  Assinatura / Faturamento
                </button>

                <div className="h-px bg-[#E5E7EB] my-1 mx-2" />

                <button
                  onClick={onSignOut}
                  className="group flex items-center justify-between w-full px-3 py-2 text-[14px] font-medium text-zinc-400 hover:text-red-400 hover:bg-red-400/10 rounded-[10px] transition-colors"
                >
                  <span>Sair</span>
                  <div className="text-zinc-500 group-hover:text-red-400 transition-colors">
                    <LogoutIcon />
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Botão de perfil (gatilho) */}
          <div
            onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
            className={cn(
              'flex items-center transition-all duration-300 rounded-[14px] cursor-pointer group',
              isCollapsed ? 'justify-center px-0 py-2' : 'justify-between px-2 py-2.5',
              isProfileMenuOpen ? 'bg-[#EFEFED]' : 'hover:bg-[#EFEFED]'
            )}
          >
            <div className={cn("flex items-center", isCollapsed ? "gap-0" : "gap-3")}>
              <div className="w-9 h-9 bg-[#E8DED1] rounded-full flex-shrink-0 flex items-center justify-center text-[#C65D3B] font-medium text-sm group-hover:scale-105 transition-transform duration-200">
                {photographerInitial}
              </div>
              <div className={cn("flex flex-col overflow-hidden transition-all duration-300 ease-in-out", isCollapsed ? "w-0 opacity-0" : "w-[140px] opacity-100")}>
                <span className="text-[#1A1A1A] font-medium text-[13px] tracking-tight leading-tight whitespace-nowrap">
                  {photographerName}
                </span>
                <span className="inline-flex items-center mt-1">
                  <span className="text-[10px] font-medium tracking-wide px-1.5 py-0.5 rounded-sm" style={{ background: '#FAF0EC', color: '#a34a2e' }}>
                    Fotux Pro
                  </span>
                </span>
              </div>
            </div>

            <div className={cn(
              'text-[#666666] group-hover:text-[#1A1A1A] overflow-hidden transition-all duration-300',
              isCollapsed ? 'w-0 opacity-0' : 'w-4 opacity-100',
              isProfileMenuOpen && !isCollapsed ? 'rotate-180 text-zinc-900' : ''
            )}>
              <ChevronUpIcon />
            </div>
          </div>

        </div>
      </div>
    </aside>
  );
};

export default AdminSidebar;
