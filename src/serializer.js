export default {

  // Serialize a Kudu model instance to a JSON string compliant with the JSON
  // API specification.
  //
  // Arguments:
  //   instance     {Object|Array}    A Kudu model instance or an array of
  //                                  model instances.
  //   options      {Object}          A configuration object. See below.
  //
  // Options:
  //   stringify    {Boolean}    If set, return a JSON string. Otherwise,
  //                             return a serializable subset of the model
  //                             instance as an object.
  //   requireId    {Boolean}    If set, an "id" property must be present on
  //                             the instance. This is almost always the case,
  //                             except when the resource has been created on
  //                             the client and not saved.
  //
  toJSON( instance = null, {
    stringify = true,
    requireId = true,
  } = {} ) {

    // If we don't have an instance to serialize we just return null.
    if ( !instance ) {
      return stringify ? JSON.stringify(null) : null;
    }

    const doc = Object.create(null);
    let included;

    if ( Array.isArray(instance) ) {

      doc.data = instance.map(buildResource);
      included = flatten(instance.map(buildCompoundDocuments));
    } else {

      doc.data = buildResource(instance, requireId);
      included = buildCompoundDocuments(instance);
    }

    if ( included && included.length ) {

      // Remove any duplicate documents from the array of includes. We treat two
      // documents as equal if they have the same type and identifier. This
      // potentially reduces the size of data being sent over the wire.
      included = included.reduce(( arr, item ) => {

        if ( !arr.some(( doc ) =>
          doc.type === item.type && doc.id === item.id)
        ) {
          arr.push(item);
        }

        return arr;
      }, []);

      doc.included = included;
    }

    return stringify ? JSON.stringify(doc) : doc;
  },

  // Serialize an Error-like object or an array of Error-like objects to a JSON
  // string compliant with the JSON API specification.
  //
  // Arguments:
  //   errors       {Object|Array}    An Error-like object or an array of Error
  //                                  -like objects.
  //   stringify    {Boolean}         If set, return a JSON string. Otherwise,
  //                                  return a serializable subset of the
  //                                  errors as an object.
  //
  // An Error-like object is an instance of the built-in Error constructor or
  // an object that a "message" property.
  errorsToJSON( errors, stringify = true ) {

    // The JSON API specification states that errors must be located in an
    // "errors" property of the top level document. The value of that property
    // must be an array of error objects.
    if ( !Array.isArray(errors) ) {
      errors = [ errors ];
    }

    // Map the array of Error-like objects to error objects that are compliant
    // with the JSON API spec.
    errors = errors.map(( error ) => ({
      detail: error.message,
      status: error.status,
    }));

    // If the "stringify" flag was set we convert the new object into a
    // serialized JSON string. Otherwise we just return the new object.
    const response = {
      errors,
    };

    if ( stringify ) {
      return JSON.stringify(response);
    }

    return response;
  },
};

//
// Utility functions
//

// Build a JSON API resource object for a Kudu model instance as per
// http://jsonapi.org/format/#document-resource-objects
function buildResource( instance, requireId = true ) {

  // A JSON API resource object must contain top-level "id" and "type"
  // properties. We can infer the type from the name registered when the model
  // constructor was created but "id" must be present on the instance itself.
  if ( requireId && !instance.hasOwnProperty('id') ) {
    throw new Error('Expected an "id" property.');
  }

  // Get the schema that applies to this model instance. The schema specifies
  // which properties can and cannot be transmitted to a client.
  const schema = instance.constructor.schema.properties;
  const resource = {
    type: instance.constructor.singular,
    id: instance.id,
    attributes: Object.keys(instance).reduce(( obj, key ) => {

      const keySchema = schema[ key ];

      // If a property is present in the model schema, and the property is
      // "public" then it will be included in the serialization. All properties
      // are public by default.
      if (
        keySchema &&
        ( keySchema.public === true || keySchema.public === undefined )
      ) {
        obj[ key ] = instance[ key ];
      }

      return obj;
    }, {}),
  };

  // Get any relationships that apply to this model instance.
  const relationshipSchema = instance.constructor.schema.relationships || {};
  const plural = instance.constructor.plural;

  // Build up an object representing the relationships between this instance and
  // others.
  const relationships = Object.keys(relationshipSchema).reduce(( obj, key ) => {

    const relationship = Object.create(null);

    // If the instance has an identifier we add "links" to the relationship
    // object. This is a quick and naïve way of preventing the inclusion of
    // "links" when serialzing a new instance before posting it to a server.
    if ( instance.id ) {
      relationship.links = {
        self: `/${ plural }/${ instance.id }/relationships/${ key }`,
        related: `/${ plural }/${ instance.id }/${ key }`,
      };
    }

    const nested = instance[ key ];
    const type = relationshipSchema[ key ].type;

    // If the value is an array of instances the data of the relationship object
    // will be an array of resource identifiers. Otherwise it will be a single
    // resource identifier. If the related data is an object we assume it is a
    // model instance and therefore has an "id" property. If it's a string we
    // assume that string represents the unique identifier of another document.
    if ( Array.isArray(nested) ) {

      relationship.data = nested.map(( item ) => ( {
        id: item.id ? item.id : item,
        type,
      } ));
    } else if ( nested ) {

      relationship.data = {
        id: nested.id ? nested.id : nested,
        type,
      };
    }

    obj[ key ] = relationship;
    return obj;
  }, {});

  // We only add the "relationships" member if the instance has at least one
  // relationship. The JSON API specification states that a relationship object
  // must contain at least one of a set of members and must therefore not be
  // empty.
  if ( Object.keys(relationships).length ) {
    resource.relationships = relationships;
  }

  return resource;
}

// Build an array of resource objects representing compound documents as per
// http://jsonapi.org/format/#document-compound-documents
function buildCompoundDocuments( instance ) {

  const relationshipSchema = instance.constructor.schema.relationships || {};
  let included = [];

  Object.keys(relationshipSchema).forEach(( key ) => {

    const nested = instance[ key ];

    if ( Array.isArray(nested) ) {

      included = included.concat(nested.map(( item ) => {

        if ( item && item.constructor.schema ) {
          return buildCompoundDocuments(item);
        }
      }));

      included = included.concat(
        nested
        .map(( item ) => {

          if ( item && item.id ) {
            return buildResource(item);
          }
        })
      );
    } else if ( nested && nested.id ) {
      included.push(buildResource(nested));
    }
  });

  return flatten(included.filter(( item ) => item));
}

// Flatten deeply nested arrays.
function flatten( arr ) {

  let flat = [];

  for ( let i = 0; i < arr.length; i++ ) {

    let val = arr[ i ];

    if ( Array.isArray(val) ) {
      flat = flat.concat(flatten(val));
    } else {
      flat.push(val);
    }
  }

  return flat;
}
