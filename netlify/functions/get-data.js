const { Client } = require("@notionhq/client");
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const ALLOWED_ORIGINS = [
  'https://harib-naim.fr',
  'null',
];

const getHeaders = (event) => {
  const origin = event.headers.origin;
  const headers = {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
  };
  if (ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
  }
  return headers;
};

const getPlainText = (property) => {
    if (!property || !property.rich_text) return "";
    return property.rich_text.map(t => t.plain_text).join('');
};

const getTitle = (property) => property?.title?.[0]?.plain_text || "";
const getUrl = (property) => property?.url || "";
const getSelect = (property) => property?.select?.name || null;
const getNumber = (property) => property?.number || 0;

exports.handler = async function (event) {
  const headers = getHeaders(event);
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    const [profileDb, socialsDb, linksDb, songsDb] = await Promise.all([
      notion.databases.query({ database_id: process.env.NOTION_PROFILE_DB_ID }),
      notion.databases.query({ database_id: process.env.NOTION_SOCIALS_DB_ID }),
      notion.databases.query({ database_id: process.env.NOTION_LINKS_DB_ID }),
      notion.databases.query({ database_id: process.env.NOTION_SONGS_DB_ID }),
    ]);

    if (profileDb.results.length === 0) {
      throw new Error("La base de données 'Profile & Appearance' dans Notion est vide.");
    }
    const profileProps = profileDb.results[0].properties;

    let sectionOrder;
    try {
        sectionOrder = JSON.parse(getPlainText(profileProps.section_order));
        if (!Array.isArray(sectionOrder)) throw new Error();
    } catch(e) {
        sectionOrder = ['socials', 'songs', 'links'];
    }
    
    const formattedData = {
      profilePageId: profileDb.results[0].id,
      sectionOrder, // Ajout de l'ordre des sections
      profile: {
        title: getPlainText(profileProps.profile_title),
        description: getPlainText(profileProps.profile_description),
        pictureUrl: getPlainText(profileProps.picture_url),
      },
      appearance: {
        fontFamily: getPlainText(profileProps.font_family) || "'Inter', sans-serif",
        textColor: getPlainText(profileProps.text_color) || "#121212",
        socialIconsColor: getPlainText(profileProps.social_icons_color) || getPlainText(profileProps.text_color) || "#121212",
        titleColor: getPlainText(profileProps.profile_title_color),
        descriptionColor: getPlainText(profileProps.profile_description_color),
        background: {
          type: getSelect(profileProps.background_type) || "solid",
          value: getPlainText(profileProps.background_value),
        },
        link: {
          backgroundColor: getPlainText(profileProps.link_bg_color) || "#FFFFFF",
          textColor: getPlainText(profileProps.link_text_color) || "#000000",
          borderRadius: getPlainText(profileProps.link_border_radius) || '8px',
          borderWidth: getPlainText(profileProps.link_border_width) || '0px',
          borderColor: getPlainText(profileProps.link_border_color) || '#000000',
          shadowType: getSelect(profileProps.link_shadow_type) || 'none',
          shadowIntensity: getNumber(profileProps.link_shadow_intensity) || 10,
          shadowColor: getPlainText(profileProps.link_shadow_color) || '#000000',
        },
        header: {
            backgroundColor: getPlainText(profileProps.header_bg_color) || "transparent",
            textColor: getPlainText(profileProps.header_text_color) || "#121212",
            borderRadius: getPlainText(profileProps.header_border_radius) || '0px',
            borderWidth: getPlainText(profileProps.header_border_width) || '0px',
            borderColor: getPlainText(profileProps.header_border_color) || '#000000',
            shadowType: getSelect(profileProps.header_shadow_type) || 'none',
            shadowIntensity: getNumber(profileProps.header_shadow_intensity) || 10,
            shadowColor: getPlainText(profileProps.header_shadow_color) || '#000000',
        },
        pictureLayout: getSelect(profileProps.picture_layout) || "circle",
      },
      seo: { 
        title: getPlainText(profileProps.seo_title), 
        description: getPlainText(profileProps.seo_description), 
        faviconUrl: getPlainText(profileProps.seo_faviconUrl) 
      },
      socials: socialsDb.results.map(item => ({
        pageId: item.id,
        id: getNumber(item.properties.id),
        network: getTitle(item.properties.Network),
        url: getUrl(item.properties.URL),
        order: getNumber(item.properties.Order)
      })).sort((a, b) => a.order - b.order),
      links: linksDb.results.map(item => ({
        pageId: item.id,
        id: getNumber(item.properties.id),
        type: getSelect(item.properties.type),
        title: getTitle(item.properties.Title),
        url: getUrl(item.properties.URL),
        thumbnailUrl: getPlainText(item.properties['Thumbnail URL']),
        order: getNumber(item.properties.Order)
      })).sort((a, b) => a.order - b.order),
      songs: songsDb.results.map(item => ({
        pageId: item.id,
        songId: getPlainText(item.properties.SongID),
        title: getTitle(item.properties.Title),
        artist: getPlainText(item.properties.Artist),
        albumArtUrl: getUrl(item.properties.AlbumArtURL),
        spotifyUrl: getUrl(item.properties.SpotifyURL),
        order: getNumber(item.properties.Order)
      })).sort((a, b) => a.order - b.order),
    };

    return {
      statusCode: 200,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify(formattedData),
    };

  } catch (error) {
    console.error("[get-data] Function Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message || "Impossible de récupérer les données depuis Notion." }),
    };
  }
};