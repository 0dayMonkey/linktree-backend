const { Client } = require("@notionhq/client");
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const ALLOWED_ORIGINS = [
  'https://harib-naim.fr',
  'null',
];

const getHeaders = (event) => {
  const origin = event.headers.origin;
  const headers = {};
  if (ALLOWED_ORIGINS.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
  }
  return headers;
};

const toRichText = (content) => {
    if (content === null || content === undefined) return [];
    const strContent = String(content);
    const maxLength = 2000;
    const chunks = [];
    for (let i = 0; i < strContent.length; i += maxLength) {
        chunks.push({ text: { content: strContent.substring(i, i + maxLength) } });
    }
    return chunks;
};

const toTitle = (content) => [{ text: { content: content || "" } }];

// CORRECTION : La fonction manquante est maintenant définie ici.
const getNumber = (property) => property?.number || 0;

const updateProfilePage = (pageId, data) => {
    if (!pageId) throw new Error("L'ID de la page de profil est manquant.");
    const { profile, appearance, seo, sectionOrder } = data;
    
    return notion.pages.update({
        page_id: pageId,
        properties: {
            'profile_title': { rich_text: toRichText(profile.title) },
            'profile_description': { rich_text: toRichText(profile.description) },
            'picture_url': { rich_text: toRichText(profile.pictureUrl) },
            'font_family': { rich_text: toRichText(appearance.fontFamily) },
            'text_color': { rich_text: toRichText(appearance.textColor) },
            'profile_title_color': { rich_text: toRichText(appearance.titleColor) },
            'profile_description_color': { rich_text: toRichText(appearance.descriptionColor) },
            'background_type': { select: { name: appearance.background.type || "solid" } },
            'background_value': { rich_text: toRichText(appearance.background.value) },
            'link_bg_color': { rich_text: toRichText(appearance.link.backgroundColor) },
            'link_text_color': { rich_text: toRichText(appearance.link.textColor) },
            'link_border_radius': { rich_text: toRichText(appearance.link.borderRadius) },
            'link_border_width': { rich_text: toRichText(appearance.link.borderWidth) },
            'link_border_color': { rich_text: toRichText(appearance.link.borderColor) },
            'header_bg_color': { rich_text: toRichText(appearance.header.backgroundColor) },
            'header_text_color': { rich_text: toRichText(appearance.header.textColor) },
            'header_border_radius': { rich_text: toRichText(appearance.header.borderRadius) },
            'header_border_width': { rich_text: toRichText(appearance.header.borderWidth) },
            'header_border_color': { rich_text: toRichText(appearance.header.borderColor) },
            'seo_title': { rich_text: toRichText(seo.title) },
            'seo_description': { rich_text: toRichText(seo.description) },
            'seo_faviconUrl': { rich_text: toRichText(seo.faviconUrl) },
            'picture_layout': { select: { name: appearance.pictureLayout || "circle" } },
            // NOUVEAU : Sauvegarde de l'ordre des sections
            'section_order': { rich_text: toRichText(JSON.stringify(sectionOrder || ['socials', 'songs', 'links'])) },
        }
    });
};

const syncItems = async (dbId, items, existingPages, type) => {
    const operations = [];
    const adminItemIds = new Set(items.map(i => i.id || i.songId));
    
    for (const [index, item] of items.entries()) {
        const properties = { 'Order': { number: index } };
        let itemId;

        if (type === 'social') {
            properties.id = { number: item.id };
            properties.Network = { title: toTitle(item.network) };
            properties.URL = { url: item.url || null };
            itemId = item.id;
        } else if (type === 'link') {
            properties.id = { number: item.id };
            properties.Title = { title: toTitle(item.title) };
            properties.type = { select: { name: item.type || "link" } };
            properties.URL = { url: item.url || null };
            properties['Thumbnail URL'] = { rich_text: toRichText(item.thumbnailUrl) };
            itemId = item.id;
        } else if (type === 'song') {
            properties.SongID = { rich_text: toRichText(item.songId) };
            properties.Title = { title: toTitle(item.title) };
            properties.Artist = { rich_text: toRichText(item.artist) };
            properties.AlbumArtURL = { url: item.albumArtUrl || null };
            properties.SpotifyURL = { url: item.spotifyUrl || null };
            itemId = item.songId;
        }

        const existingPage = existingPages.find(p => {
            const pageIdProp = type === 'song' ? 'SongID' : 'id';
            const pageIdValue = type === 'song' ? getPlainText(p.properties[pageIdProp]) : getNumber(p.properties[pageIdProp]);
            return String(pageIdValue) === String(itemId);
        });

        if (existingPage) {
            operations.push(notion.pages.update({ page_id: existingPage.id, properties }));
        } else {
            operations.push(notion.pages.create({ parent: { database_id: dbId }, properties }));
        }
    }

    const pagesToDelete = existingPages.filter(p => {
        const pageIdProp = type === 'song' ? 'SongID' : 'id';
        const pageIdValue = type === 'song' ? getPlainText(p.properties[pageIdProp]) : getNumber(p.properties[pageIdProp]);
        return !adminItemIds.has(pageIdValue);
    });

    for (const page of pagesToDelete) {
        operations.push(notion.pages.update({ page_id: page.id, archived: true }));
    }
    
    await Promise.all(operations);
};

exports.handler = async function (event) {
  const headers = getHeaders(event);
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    if (!event.body) throw new Error("Le corps de la requête est vide.");
    const { secret, data } = JSON.parse(event.body);
    if (secret !== process.env.UPDATE_SECRET_KEY) return { statusCode: 401, headers, body: 'Non autorisé' };
    if (!data) throw new Error("L'objet de données est manquant.");

    const [existingLinks, existingSocials, existingSongs] = await Promise.all([
        notion.databases.query({ database_id: process.env.NOTION_LINKS_DB_ID }),
        notion.databases.query({ database_id: process.env.NOTION_SOCIALS_DB_ID }),
        notion.databases.query({ database_id: process.env.NOTION_SONGS_DB_ID }),
    ]);

    await Promise.all([
        updateProfilePage(data.profilePageId, data),
        syncItems(process.env.NOTION_LINKS_DB_ID, data.links || [], existingLinks.results, 'link'),
        syncItems(process.env.NOTION_SOCIALS_DB_ID, data.socials || [], existingSocials.results, 'social'),
        syncItems(process.env.NOTION_SONGS_DB_ID, data.songs || [], existingSongs.results, 'song'),
    ]);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Mise à jour réussie' })
    };
  } catch (error) {
    console.error("[update-data] Function Error:", error);
    return {
      statusCode: error.status || 500,
      headers,
      body: JSON.stringify({ message: error.message, code: error.code }),
    };
  }
};