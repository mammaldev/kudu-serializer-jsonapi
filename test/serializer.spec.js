import chai from 'chai';
import Kudu from 'kudu';
import Serialize from '../src/serializer';

let expect = chai.expect;

describe('Serializer', () => {

  let kudu;
  let Model;
  let Child;

  beforeEach(() => {
    kudu = new Kudu();
    Model = kudu.createModel('test', {
      properties: {
        name: {
          type: String,
        },
        private: {
          type: String,
          public: false,
        },
      },
      relationships: {
        children: { type: 'child', hasMany: true },
      },
    });
    Child = kudu.createModel('child', {
      properties: {
        name: {
          type: String,
        },
      },
    });
  });

  describe('#toJSON', () => {

    it('should return the JSON "null" value if no instance is provided', () => {
      let serialized = Serialize.toJSON();
      expect(JSON.parse((serialized))).to.equal(null);
    });

    it('should return the null value if no instance is provided and the relevant flag is not set', () => {
      let serialized = Serialize.toJSON(null, { stringify: false });
      expect(serialized).to.equal(null);
    });

    it('should return a JSON string', () => {
      let instance = new Model({ name: 'test', id: '1' });
      let serialized = Serialize.toJSON(instance);
      expect(JSON.parse(serialized)).to.be.an('object');
    });

    it('should return an object if the relevant flag is not set', () => {
      let instance = new Model({ name: 'test', id: '1' });
      let serialized = Serialize.toJSON(instance, { stringify: false });
      expect(serialized).to.be.an('object');
    });

    it('should throw an error if no "id" is present on the instance', () => {
      let instance = new Model({ name: 'test' });
      let test = () => Serialize.toJSON(instance);
      expect(test).to.throw(Error, /"id"/);
    });

    it('should not throw if no "id" is present and the relevant flag is set', () => {
      let instance = new Model({ name: 'test' });
      let test = () => Serialize.toJSON(instance, { requireId: false });
      expect(test).not.to.throw(Error);
    });

    it('should have an "id" property at the top level', () => {
      let instance = new Model({ name: 'test', id: '1' });
      let serialized = Serialize.toJSON(instance);
      expect(JSON.parse(serialized).data.id).to.equal('1');
    });

    it('should have a "type" property at the top level', () => {
      let instance = new Model({ name: 'test', id: '1' });
      let serialized = Serialize.toJSON(instance);
      expect(JSON.parse(serialized).data.type).to.equal('test');
    });

    it('should exclude non-schema properties from the result', () => {
      let instance = new Model({ name: 'test', id: '1', excluded: true });
      let serialized = Serialize.toJSON(instance);
      expect(JSON.parse(serialized).data.attributes).to.not.have.property('excluded');
    });

    it('should exclude private properties from the result', () => {
      let instance = new Model({ name: 'test', id: '1', private: true });
      let serialized = Serialize.toJSON(instance);
      expect(JSON.parse(serialized).data.attributes).to.not.have.property('private');
    });

    it('should serialize an array of instances', () => {
      let instances = [
        new Model({ name: '1', id: '1' }),
        new Model({ name: '2', id: '2' }),
      ];
      let serialized = Serialize.toJSON(instances);
      expect(JSON.parse(serialized).data).to.be.an('array');
    });

    it('should include relationships', () => {
      let instance = new Model({ name: 'test', id: '1' });
      let serialized = Serialize.toJSON(instance);
      expect(JSON.parse(serialized).data.relationships).to.deep.equal({
        children: {
          links: {
            self: '/tests/1/relationships/children',
            related: '/tests/1/children',
          },
        },
      });
    });

    it('should include relationships in each element of an array', () => {
      let instances = [
        new Model({ name: '1', id: '1' }),
        new Model({ name: '2', id: '2' }),
      ];
      let serialized = Serialize.toJSON(instances);
      expect(JSON.parse(serialized).data[ 0 ].relationships).to.deep.equal({
        children: {
          links: {
            self: '/tests/1/relationships/children',
            related: '/tests/1/children',
          },
        },
      });
    });
  });

  describe('#errorsToJSON', () => {

    it('should return a JSON string', () => {
      let error = new Error('test');
      let serialized = Serialize.errorsToJSON(error);
      expect(JSON.parse(serialized)).to.deep.equal({
        errors: [ { detail: 'test' } ],
      });
    });

    it('should return an object when the relevant flag is set', () => {
      let error = new Error('test');
      let serialized = Serialize.errorsToJSON(error, false);
      expect(JSON.parse(JSON.stringify(serialized))).to.deep.equal({
        errors: [ { detail: 'test' } ],
      });
    });

    it('should serialize an array of errors', () => {
      let errors = [
        new Error('test1'),
        new Error('test2'),
      ];
      let serialized = Serialize.errorsToJSON(errors);
      expect(JSON.parse(serialized).errors).to.be.an('array');
    });
  });
});
