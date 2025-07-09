const { Client } = require("@notionhq/client");
const notion = new Client({ auth: process.env.NOTION_TOKEN });

const headers = {
  'Access-Control-Allow-Origin': 'https://harib-naim.fr',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// --- Fonctions de mise à jour pour Notion ---

const updateProfilePage = (pageId, data) => {
    const { profile, appearance, seo } = data;
    return notion.pages.update({
        page_id: pageId,
        properties: {
            'profile_title': { rich_text: [{ text: { content: profile.title || "" } }] },
            'picture_url': { url: profile.pictureUrl || null },
            'font_family': { rich_text: [{ text: { content: appearance.fontFamily || "" } }] },
            'text_color': { rich_text: [{ text: { content: appearance.textColor || "" } }] },
            'background_type': { select: { name: appearance.background.type || "solid" } },
            'background_value': { rich_text: [{ text: { content: (Array.isArray(appearance.background.value) ? appearance.background.value.join(',') : appearance.background.value) } }] },
            'button_bg_color': { rich_text: [{ text: { content: appearance.button.backgroundColor || "" } }] },
            'button_text_color': { rich_text: [{ text: { content: appearance.button.textColor || "" } }] },
            'seo_title': { rich_text: [{ text: { content: seo.title || "" } }] },
            'seo_description': { rich_text: [{ text: { content: seo.description || "" } }] },
            'seo_faviconUrl': { url: seo.faviconUrl || null },
        }
    });
};

const createOrUpdatePage = (dbId, item, existingPages, isSocial = false) => {
    const pageId = item.pageId;
    const properties = {
        'id': { number: item.id },
        'Order': { number: item.order || 0 },
        // ... (propriétés communes)
    };

    if (isSocial) {
        properties.Network = { title: [{ text: { content: item.network || "website" } }] };
        properties.URL = { url: item.url || null };
    } else { // Link or Header
        properties.Title = { title: [{ text: { content: item.title || "" } }] };
        properties.Type = { select: { name: item.type || "link" } };
        properties.URL = { url: item.url || null };
        properties['Thumbnail URL'] = { url: item.thumbnailUrl || null };
    }
    
    // Si la page existe, on la met à jour. Sinon, on la crée.
    if (pageId && existingPages.find(p => p.id === pageId)) {
        return notion.pages.update({ page_id: pageId, properties });
    } else {
        return notion.pages.create({ parent: { database_id: dbId }, properties });
    }
};

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  try {
    const { secret, data } = JSON.parse(event.body);
    if (secret !== process.env.UPDATE_SECRET_KEY) {
      return { statusCode: 401, headers, body: 'Unauthorized' };
    }

    const linksDbId = process.env.NOTION_LINKS_DB_ID;
    const socialsDbId = process.env.NOTION_SOCIALS_DB_ID;

    // 1. Mettre à jour le profil
    if (data.profilePageId) {
      await updateProfilePage(data.profilePageId, data);
    }
    
    // 2. Gérer les liens et les icônes sociales (Mise à jour, Création, Suppression)
    const [existingLinks, existingSocials] = await Promise.all([
        notion.databases.query({ database_id: linksDbId }),
        notion.databases.query({ database_id: socialsDbId })
    ]);

    // Items à mettre à jour ou à créer
    const linkPromises = data.links.map((link, index) => createOrUpdatePage(linksDbId, {...link, order: index}, existingLinks.results));
    const socialPromises = data.socials.map((social, index) => createOrUpdatePage(socialsDbId, {...social, order: index}, existingSocials.results, true));
    
    // Items à supprimer
    const linkIdsToKeep = data.links.map(l => l.pageId);
    const linksToDelete = existingLinks.results.filter(p => !linkIdsToKeep.includes(p.id));
    const socialIdsToKeep = data.socials.map(s => s.pageId);
    const socialsToDelete = existingSocials.results.filter(p => !socialIdsToKeep.includes(p.id));
    
    const deletionPromises = [
        ...linksToDelete.map(p => notion.pages.update({ page_id: p.id, archived: true })),
        ...socialsToDelete.map(p => notion.pages.update({ page_id: p.id, archived: true }))
    ];

    // Exécuter toutes les promesses
    await Promise.all([...linkPromises, ...socialPromises, ...deletionPromises]);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ message: 'Update successful' })
    };

  } catch (error) {
    console.error("Update Error:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.body || "An internal server error occurred." }),
    };
  }
};