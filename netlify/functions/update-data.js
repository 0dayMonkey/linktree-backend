const { Client } = require("@notionhq/client");
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const headers = {
  'Access-Control-Allow-Origin': '*', 
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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

const isValidImageUrl = (url) => {
    if (!url) return null;
    const sUrl = String(url);
    // Accepte les URL http/https et les données Base64
    if (sUrl.startsWith('http') || sUrl.startsWith('data:image')) {
        return sUrl;
    }
    return null;
};

const updateProfilePage = (pageId, data) => {
    if (!pageId) throw new Error("L'ID de la page de profil est manquant.");
    const { profile, appearance, seo } = data;

    const backgroundValue = isValidImageUrl(appearance.background.value) ||
        (appearance.background.type === 'gradient' ? appearance.background.value : appearance.background.value);

    return notion.pages.update({
        page_id: pageId,
        properties: {
            'profile_title': { rich_text: toRichText(profile.title) },
            'profile_description': { rich_text: toRichText(profile.description) },
            'picture_url': { rich_text: toRichText(isValidImageUrl(profile.pictureUrl)) },
            'font_family': { rich_text: toRichText(appearance.fontFamily) },
            'text_color': { rich_text: toRichText(appearance.textColor) },
            'profile_title_color': { rich_text: toRichText(appearance.titleColor) },
            'profile_description_color': { rich_text: toRichText(appearance.descriptionColor) },
            'background_type': { select: { name: appearance.background.type || "solid" } },
            'background_value': { rich_text: toRichText(backgroundValue) },
            
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
            'seo_faviconUrl': { rich_text: toRichText(isValidImageUrl(seo.faviconUrl)) },
            'picture_layout': { select: { name: appearance.pictureLayout || "circle" } },
        }
    });
};

const syncItems = async (dbId, items, existingPages, isSocial = false) => {
    const operations = [];
    const adminItemIds = new Set(items.map(i => i.id));
    
    for (const [index, item] of items.entries()) {
        const properties = { 'id': { number: item.id }, 'Order': { number: index } };
        
        if (isSocial) {
            properties.Network = { title: toTitle(item.network) };
            properties.URL = { url: item.url || null };
        } else {
            properties.Title = { title: toTitle(item.title) };
            properties.type = { select: { name: item.type || "link" } };
            properties.URL = { url: item.url || null };
            properties['Thumbnail URL'] = { rich_text: toRichText(isValidImageUrl(item.thumbnailUrl)) };
        }

        const existingPage = existingPages.find(p => p.properties.id.number === item.id);
        if (existingPage) {
            operations.push(notion.pages.update({ page_id: existingPage.id, properties }));
        } else {
            operations.push(notion.pages.create({ parent: { database_id: dbId }, properties }));
        }
    }

    const pagesToDelete = existingPages.filter(p => !adminItemIds.has(p.properties.id.number));
    for (const page of pagesToDelete) {
        operations.push(notion.pages.update({ page_id: page.id, archived: true }));
    }
    
    await Promise.all(operations);
};

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Méthode non autorisée' };

  try {
    if (!event.body) throw new Error("Le corps de la requête est vide.");
    const { secret, data } = JSON.parse(event.body);
    if (secret !== process.env.UPDATE_SECRET_KEY) return { statusCode: 401, headers, body: 'Non autorisé' };
    if (!data) throw new Error("L'objet de données est manquant.");

    const [existingLinks, existingSocials] = await Promise.all([
        notion.databases.query({ database_id: process.env.NOTION_LINKS_DB_ID }),
        notion.databases.query({ database_id: process.env.NOTION_SOCIALS_DB_ID })
    ]);

    await Promise.all([
        updateProfilePage(data.profilePageId, data),
        syncItems(process.env.NOTION_LINKS_DB_ID, data.links || [], existingLinks.results, false),
        syncItems(process.env.NOTION_SOCIALS_DB_ID, data.socials || [], existingSocials.results, true)
    ]);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Mise à jour réussie' })
    };
  } catch (error) {
    return {
      statusCode: error.status || 500,
      headers,
      body: JSON.stringify({ message: error.message, code: error.code }),
    };
  }
};